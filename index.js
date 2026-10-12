require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const pool = require("./db");

const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");

// lets us read form data from req.body
app.use(express.urlencoded({ extended: true }));
// serves the css file
app.use(express.static("public"));

// sessions keep track of who is signed in
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// this makes "currentUser" available in every ejs file
app.use(function (req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
});

// if you're not signed in, go to the sign in page
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/signin");
  }
  next();
}


// ---------- SIGN UP ----------

app.get("/signup", function (req, res) {
  res.render("signup", { error: null });
});

app.post("/signup", async function (req, res) {
  const userId = req.body.user_id;
  const password = req.body.password;
  const name = req.body.name;

  try {
    // check if that user id is already used
    const check = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);

    if (check.rows.length > 0) {
      return res.render("signup", {
        error: "That user ID is taken, please pick a different one.",
      });
    }

    // hash the password so we never store the real one
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)",
      [userId, hashedPassword, name]
    );

    res.redirect("/signin");
  } catch (err) {
    console.log(err);
    res.render("signup", { error: "Something went wrong, try again." });
  }
});


// ---------- SIGN IN ----------

app.get("/signin", function (req, res) {
  res.render("signin", { error: null });
});

app.post("/signin", async function (req, res) {
  const userId = req.body.user_id;
  const password = req.body.password;

  try {
    // look up the user by their id
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
    const user = result.rows[0];

    // no user found = wrong id
    if (!user) {
      return res.render("signin", { error: "Wrong user ID or password." });
    }

    // compare the typed password with the hashed one in the database
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.render("signin", { error: "Wrong user ID or password." });
    }

    // save the user in the session and go to the feed
    req.session.user = { user_id: user.user_id, name: user.name };
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.render("signin", { error: "Something went wrong, try again." });
  }
});

app.post("/signout", function (req, res) {
  req.session.destroy(function () {
    res.redirect("/signin");
  });
});


// ---------- VIEW ALL POSTS ----------

app.get("/", requireLogin, async function (req, res) {
  try {
    // newest posts first
    const result = await pool.query("SELECT * FROM blogs ORDER BY date_created DESC");
    res.render("index", { blogs: result.rows });
  } catch (err) {
    console.log(err);
    res.status(500).send("Couldn't load the posts.");
  }
});


// ---------- CREATE A POST ----------

app.post("/posts", requireLogin, async function (req, res) {
  const title = req.body.title;
  const body = req.body.body;

  // creator info comes from the session, not the form
  const creatorId = req.session.user.user_id;
  const creatorName = req.session.user.name;

  try {
    await pool.query(
      "INSERT INTO blogs (creator_name, creator_user_id, title, body, date_created) VALUES ($1, $2, $3, $4, NOW())",
      [creatorName, creatorId, title, body]
    );
    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.status(500).send("Couldn't create the post.");
  }
});


// ---------- EDIT A POST ----------

// show the edit form with the post already filled in
app.get("/posts/:id/edit", requireLogin, async function (req, res) {
  try {
    const result = await pool.query("SELECT * FROM blogs WHERE blog_id = $1", [req.params.id]);
    const blog = result.rows[0];

    if (!blog) {
      return res.status(404).send("Post not found.");
    }

    // only the person who wrote it can edit it
    if (blog.creator_user_id !== req.session.user.user_id) {
      return res.status(403).send("You can only edit your own posts.");
    }

    res.render("edit", { blog: blog });
  } catch (err) {
    console.log(err);
    res.status(500).send("Couldn't load the post.");
  }
});

// save the changes
app.post("/posts/:id/edit", requireLogin, async function (req, res) {
  const title = req.body.title;
  const body = req.body.body;

  try {
    // the AND creator_user_id part makes sure you can't update someone else's post
    const result = await pool.query(
      "UPDATE blogs SET title = $1, body = $2 WHERE blog_id = $3 AND creator_user_id = $4",
      [title, body, req.params.id, req.session.user.user_id]
    );

    if (result.rowCount === 0) {
      return res.status(403).send("You can only edit your own posts.");
    }

    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.status(500).send("Couldn't update the post.");
  }
});


// ---------- DELETE A POST ----------

app.post("/posts/:id/delete", requireLogin, async function (req, res) {
  try {
    // same idea as editing, only delete if it's your post
    const result = await pool.query(
      "DELETE FROM blogs WHERE blog_id = $1 AND creator_user_id = $2",
      [req.params.id, req.session.user.user_id]
    );

    if (result.rowCount === 0) {
      return res.status(403).send("You can only delete your own posts.");
    }

    res.redirect("/");
  } catch (err) {
    console.log(err);
    res.status(500).send("Couldn't delete the post.");
  }
});


// ---------- ACCOUNT PAGE (bonus) ----------

app.get("/account", requireLogin, function (req, res) {
  res.render("account", { error: null, success: null });
});

app.post("/account", requireLogin, async function (req, res) {
  const oldUserId = req.session.user.user_id;
  const newUserId = req.body.new_user_id.trim() || oldUserId;
  const newPassword = req.body.new_password;

  try {
    // if they picked a new id, make sure nobody else has it
    if (newUserId !== oldUserId) {
      const check = await pool.query("SELECT * FROM users WHERE user_id = $1", [newUserId]);

      if (check.rows.length > 0) {
        return res.render("account", { error: "That user ID is already taken.", success: null });
      }
    }

    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query(
        "UPDATE users SET user_id = $1, password = $2 WHERE user_id = $3",
        [newUserId, hashedPassword, oldUserId]
      );
    } else {
      await pool.query("UPDATE users SET user_id = $1 WHERE user_id = $2", [newUserId, oldUserId]);
    }

    // the blogs table updates on its own because of ON UPDATE CASCADE in schema.sql
    req.session.user.user_id = newUserId;
    res.render("account", { error: null, success: "Account updated!" });
  } catch (err) {
    console.log(err);
    res.render("account", { error: "Something went wrong, try again.", success: null });
  }
});


app.listen(port, function () {
  console.log("Server running on http://localhost:" + port);
});
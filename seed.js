const bcrypt = require("bcryptjs");
const pool = require("./db");

const users = [
  { user_id: "alice", password: "alice123", name: "Alice Johnson" },
  { user_id: "bob", password: "bob123", name: "Bob Martinez" },
  { user_id: "carol", password: "carol123", name: "Carol Nguyen" },
];

// order: creator_user_id, creator_name, title, body, date_created
const blogs = [
  ["alice", "Alice Johnson", "Getting Started with Express", "Express keeps routing simple: one function per route, and middleware to share logic. This post walks through my first server.", "2026-09-01 10:15:00"],
  ["alice", "Alice Johnson", "Why I Like EJS Templates", "EJS lets you write normal HTML with a little JavaScript sprinkled in. Partials make headers and footers reusable.", "2026-09-05 14:30:00"],
  ["bob", "Bob Martinez", "Hiking the San Francisco Peaks", "Last weekend I hiked up near Flagstaff. The aspens were turning gold and the views were unreal.", "2026-09-10 08:00:00"],
  ["bob", "Bob Martinez", "Three Tips for Learning SQL", "Start with SELECT, learn JOINs early, and always use parameterized queries to avoid injection.", "2026-09-14 19:45:00"],
  ["carol", "Carol Nguyen", "My Favorite Study Snacks", "Trail mix, apples with peanut butter, and way too much coffee. Here is what actually keeps me focused.", "2026-09-18 12:20:00"],
  ["carol", "Carol Nguyen", "Debugging Like a Detective", "Reproduce the bug, shrink it, form a hypothesis, then test it. Console logs are underrated.", "2026-09-22 16:05:00"],
];

async function seed() {
  try {
    // users first, since blogs point to them
    for (const user of users) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await pool.query(
        "INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING",
        [user.user_id, hashedPassword, user.name]
      );
    }

    for (const blog of blogs) {
      await pool.query(
        "INSERT INTO blogs (creator_user_id, creator_name, title, body, date_created) VALUES ($1, $2, $3, $4, $5)",
        blog
      );
    }

    console.log("Done! Added 3 users and 6 blogs.");
    console.log("You can sign in with alice/alice123, bob/bob123, or carol/carol123");
  } catch (err) {
    console.log("Seed failed:", err.message);
  } finally {
    await pool.end();
  }
}

seed();
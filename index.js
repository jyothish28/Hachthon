import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import env from "dotenv";
import ejs from "ejs";
import multer from "multer";
import path from "path";
import fs from "fs/promises"; // Added for file deletion

const app = express();
const port = 3000;
const saltRounds = 10;

env.config();

app.set("view engine", "ejs");

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: 5432,
});

db.connect()
  .then(() => console.log("Database connected"))
  .catch((err) => console.error("Database connection error:", err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.static("uploads")); // Serve uploads directory
app.use(passport.initialize());
app.use(passport.session());

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Ensure this folder exists
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "video/mp4", "video/webm"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images (JPEG, PNG) and videos (MP4, WebM) are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).redirect("/login");
};

const getAvailableEvents = async () => {
  const result = await db.query(`
    SELECT * FROM events 
    WHERE registration_start_date <= NOW() 
    AND registration_expiry_date >= NOW()
    AND event_date >= NOW()
    ORDER BY event_date ASC
  `);
  return result.rows;
};

// Routes
app.get("/", (req, res) => {
  res.status(200).render("register", { msg: null });
});

app.get("/login", (req, res) => {
  res.status(200).render("login", { msg: null });
});

app.get("/register", (req, res) => {
  res.status(200).render("register", { msg: null });
});



app.get("/participant", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const announcementsResult = await db.query(
      `
      SELECT a.id, a.content, a.image_path, a.video_path, a.created_at, e.event_name, e.organizer_name
      FROM announcements a
      INNER JOIN events e ON a.event_id = e.event_id
      INNER JOIN event_registrations er ON e.event_id = er.event_id
      WHERE er.user_id = $1
      ORDER BY a.created_at DESC
      `,
      [userId]
    );

    res.status(200).render("participant", {
      user: req.user,
      announcements: announcementsResult.rows,
      error: null,
      success: req.query.success || null, 
    });
  } catch (err) {
    console.error("Error fetching participant data:", err);
    res.status(500).render("participant", {
      user: req.user,
      announcements: [],
      error: "Failed to load participant data",
      success: null,
    });
  }
});


app.get("/organizer", ensureAuthenticated, (req, res) => {
  res.status(200).render("organizer", {
    user: req.user,
    error: null,
    success: req.query.success || null, 
  });
});

app.get("/profile", ensureAuthenticated, (req, res) => {
  res.status(200).render("profile", {
    user: req.user,
    error: null,
    success: req.query.success || null, 
  });
});

app.get("/registered", ensureAuthenticated, async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await db.query(
      `
      SELECT e.event_id, e.event_name, e.organizer_name, e.event_date, 
             e.event_location, e.registration_start_date, e.registration_expiry_date,
             e.max_participants
      FROM events e
      INNER JOIN event_registrations er ON e.event_id = er.event_id
      WHERE er.user_id = $1
      ORDER BY e.event_date ASC
    `,
      [user_id]
    );

    res.status(200).render("registered", {
      registeredEvents: result.rows,
      user: req.user,
      error: null,
    });
  } catch (err) {
    console.error("Error fetching registered events:", err);
    res.status(500).render("registered", {
      registeredEvents: [],
      user: req.user,
      error: "Failed to load registered events",
    });
  }
});

app.get("/addEvent", ensureAuthenticated, (req, res) => {
  res.status(200).render("addEvent", {
    oName: req.user.name,
    oMail: req.user.email,
    error: null,
    success: null,
  });
});

app.get("/submission", ensureAuthenticated, (req, res) => {
  const eventId = req.query.event_id;
  res.status(200).render("submission", { eventId, user: req.user, error: null, success: null });
});

app.post("/submission", ensureAuthenticated, upload.single("project-submission"), async (req, res) => {
  try {
    const { "hackathon-id": eventId, "project-url": projectUrl, "project-description": projectDescription } = req.body;
    const userId = req.user.id;
    const filePath = req.file ? req.file.path : null;

    if (!eventId || !projectUrl || !projectDescription) {
      return res.status(400).render("submission", {
        eventId,
        user: req.user,
        error: "All fields are required",
        success: null,
      });
    }

    const result = await db.query(
      `
      INSERT INTO project_submissions (event_id, user_id, project_url, project_description, file_path)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
      `,
      [eventId, userId, projectUrl, projectDescription, filePath]
    );

    res.status(201).render("submission", {
      eventId,
      user: req.user,
      error: null,
      success: "Project submitted successfully!",
    });
  } catch (err) {
    console.error("Submission error:", err);
    res.status(500).render("submission", {
      eventId: req.query.event_id,
      user: req.user,
      error: "Failed to submit project: " + err.message,
      success: null,
    });
  }
});

app.get("/submissions", ensureAuthenticated, (req, res) => {
  const eventId = req.query.event_id;
  res.status(200).render("submission-form", { eventId, user: req.user, error: null, success: null }); // Assuming a separate form template
});

app.get("/submissions/list", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `
      SELECT ps.id, ps.event_id, ps.project_url, ps.project_description, ps.file_path, ps.submitted_at,
             e.event_name
      FROM project_submissions ps
      INNER JOIN events e ON ps.event_id = e.event_id
      WHERE ps.user_id = $1
      ORDER BY ps.submitted_at DESC
    `,
      [userId]
    );

    res.status(200).render("submissions", {
      submissions: result.rows,
      user: req.user,
      error: null,
      message: result.rows.length === 0 ? "No submissions found." : null,
    });
  } catch (err) {
    console.error("Error fetching submissions:", err);
    res.status(500).render("submissions", {
      submissions: [],
      user: req.user,
      error: "Failed to load submissions",
      message: null,
    });
  }
});

app.get("/events", ensureAuthenticated, async (req, res) => {
  try {
    const listEvents = await getAvailableEvents();
    res.status(200).render("events", {
      events: listEvents,
      user: req.user,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).render("events", {
      events: [],
      user: req.user,
      error: "Failed to load events",
      success: null,
    });
  }
});

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return next(err);
      }
      res.status(302).redirect("/login");
    });
  });
});

app.get("/events/new", ensureAuthenticated, (req, res) => {
  if (req.user.role !== "organizer") {
    return res.status(403).redirect("/participant");
  }
  res.status(200).render("events", {
    user: req.user,
    error: null,
    success: null,
  });
});

app.post("/addEvent", ensureAuthenticated, async (req, res) => {
  try {
    if (req.user.role !== "organizer") {
      return res.status(403).render("addEvent", {
        user: req.user,
        error: "Only organizers can create events",
        success: null,
      });
    }

    const {
      event_name,
      event_domin,
      event_description,
      event_date,
      registration_fee,
      registration_start_date,
      registration_expiry_date,
      max_participants,
      event_location,
    } = req.body;

    if (
      !event_name ||
      !event_date ||
      !registration_start_date ||
      !registration_expiry_date ||
      !max_participants ||
      !event_location
    ) {
      return res.status(400).render("addEvent", {
        user: req.user,
        error: "All required fields must be filled",
        success: null,
      });
    }

    const startDate = new Date(registration_start_date);
    const expiryDate = new Date(registration_expiry_date);
    const eventDate = new Date(event_date);

    if (startDate >= expiryDate || expiryDate >= eventDate) {
      return res.status(400).render("addEvent", {
        user: req.user,
        error: "Invalid date sequence: Start < Expiry < Event",
        success: null,
      });
    }

    if (parseInt(max_participants) <= 0) {
      return res.status(400).render("addEvent", {
        user: req.user,
        error: "Maximum participants must be greater than 0",
        success: null,
      });
    }

    const result = await db.query(
      `
      INSERT INTO events (
        event_name, domain, event_description, organizer_email, organizer_name,
        event_date, registration_fee, registration_start_date, registration_expiry_date,
        max_participants, event_location
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
      `,
      [
        event_name,
        event_domin,
        event_description,
        req.user.email,
        req.user.name,
        event_date,
        parseFloat(registration_fee) || 0.0,
        registration_start_date,
        registration_expiry_date,
        parseInt(max_participants),
        event_location,
      ]
    );

    res.status(201).render("addEvent", {
      user: req.user,
      error: null,
      success: "Event created successfully!",
    });
  } catch (err) {
    console.error("Event creation error:", err);
    res.status(500).render("addEvent", {
      user: req.user,
      error: "Failed to create event: " + err.message,
      success: null,
    });
  }
});

app.post("/events/register", ensureAuthenticated, async (req, res) => {
  try {
    const { event_id } = req.body;
    const user_id = req.user.id;

    const checkRegistration = await db.query(
      "SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2",
      [event_id, user_id]
    );

    if (checkRegistration.rows.length > 0) {
      return res.status(409).render("events", {
        events: await getAvailableEvents(),
        user: req.user,
        error: "You are already registered for this event",
        success: null,
      });
    }

    const event = await db.query("SELECT max_participants FROM events WHERE event_id = $1", [event_id]);
    const registrations = await db.query(
      "SELECT COUNT(*) as count FROM event_registrations WHERE event_id = $1",
      [event_id]
    );

    const maxParticipants = event.rows[0].max_participants;
    const currentCount = parseInt(registrations.rows[0].count);

    if (maxParticipants && currentCount >= maxParticipants) {
      return res.status(403).render("events", {
        events: await getAvailableEvents(),
        user: req.user,
        error: "This event has reached its maximum participants",
        success: null,
      });
    }

    await db.query("INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2)", [event_id, user_id]);

    res.status(201).render("events", {
      events: await getAvailableEvents(),
      user: req.user,
      error: null,
      success: "Successfully registered for the event!",
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).render("events", {
      events: await getAvailableEvents(),
      user: req.user,
      error: "Failed to register: " + err.message,
      success: null,
    });
  }
});

app.get("/hosting", ensureAuthenticated, async (req, res) => {
  if (req.user.role !== "organizer") {
    return res.status(403).redirect("/participant");
  }

  try {
    const organizerEmail = req.user.email;
    const eventsResult = await db.query(
      `
      SELECT event_id, event_name, event_date, event_location, max_participants
      FROM events
      WHERE organizer_email = $1 AND event_date >= NOW()
      ORDER BY event_date ASC
      `,
      [organizerEmail]
    );

    res.status(200).render("hosting", {
      events: eventsResult.rows,
      user: req.user,
      error: null,
    });
  } catch (err) {
    console.error("Error fetching hosted events:", err);
    res.status(500).render("hosting", {
      events: [],
      user: req.user,
      error: "Failed to load hosted events",
    });
  }
});

app.get("/hosting/event/:eventId", ensureAuthenticated, async (req, res) => {
  if (req.user.role !== "organizer") {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { eventId } = req.params;
  try {
    const participantsResult = await db.query(
      `
      SELECT u.id, u.name, u.email
      FROM users u
      INNER JOIN event_registrations er ON u.id = er.user_id
      WHERE er.event_id = $1
      `,
      [eventId]
    );

    const submissionsResult = await db.query(
      `
      SELECT ps.id AS submission_id, ps.project_url, ps.project_description, ps.file_path, 
             ps.submitted_at, u.name AS participant_name
      FROM project_submissions ps
      INNER JOIN users u ON ps.user_id = u.id
      WHERE ps.event_id = $1
      `,
      [eventId]
    );

    res.status(200).json({
      participants: participantsResult.rows,
      submissions: submissionsResult.rows,
    });
  } catch (err) {
    console.error("Error fetching event details:", err);
    res.status(500).json({ error: "Failed to load event details" });
  }
});

app.get("/announcements", ensureAuthenticated, async (req, res) => {
  if (req.user.role !== "organizer") {
    return res.status(403).redirect("/participant");
  }

  try {
    const organizerEmail = req.user.email;

    const announcementsResult = await db.query(
      `
      SELECT a.id, a.content, a.image_path, a.video_path, a.created_at, e.event_name
      FROM announcements a
      LEFT JOIN events e ON a.event_id = e.event_id
      WHERE a.organizer_email = $1
      ORDER BY a.created_at DESC
      `,
      [organizerEmail]
    );

    const eventsResult = await db.query(
      `
      SELECT event_id, event_name 
      FROM events 
      WHERE organizer_email = $1 AND event_date >= NOW() 
      ORDER BY event_date ASC
      `,
      [organizerEmail]
    );

    res.status(200).render("announcements", {
      announcements: announcementsResult.rows,
      events: eventsResult.rows,
      user: req.user,
      error: null,
      success: null,
    });
  } catch (err) {
    console.error("Error fetching announcements:", err);
    res.status(500).render("announcements", {
      announcements: [],
      events: [],
      user: req.user,
      error: "Failed to load announcements",
      success: null,
    });
  }
});

app.post(
  "/announcements",
  ensureAuthenticated,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }]),
  async (req, res) => {
    if (req.user.role !== "organizer") {
      return res.status(403).redirect("/participant");
    }

    try {
      const { content, event_id } = req.body;
      const organizerEmail = req.user.email;
      const imagePath = req.files["image"] ? req.files["image"][0].path : null;
      const videoPath = req.files["video"] ? req.files["video"][0].path : null;

      if (!content) {
        const eventsResult = await db.query(
          `
          SELECT event_id, event_name 
          FROM events 
          WHERE organizer_email = $1 AND event_date >= NOW() 
          ORDER BY event_date ASC
          `,
          [organizerEmail]
        );

        return res.status(400).render("announcements", {
          announcements: [],
          events: eventsResult.rows,
          user: req.user,
          error: "Announcement content is required",
          success: null,
        });
      }

      await db.query(
        `
        INSERT INTO announcements (organizer_email, event_id, content, image_path, video_path)
        VALUES ($1, $2, $3, $4, $5) RETURNING *
        `,
        [organizerEmail, event_id || null, content, imagePath, videoPath]
      );

      const updatedResult = await db.query(
        `
        SELECT a.id, a.content, a.image_path, a.video_path, a.created_at, e.event_name
        FROM announcements a
        LEFT JOIN events e ON a.event_id = e.event_id
        WHERE a.organizer_email = $1
        ORDER BY a.created_at DESC
        `,
        [organizerEmail]
      );

      const eventsResult = await db.query(
        `
        SELECT event_id, event_name 
        FROM events 
        WHERE organizer_email = $1 AND event_date >= NOW() 
        ORDER BY event_date ASC
        `,
        [organizerEmail]
      );

      res.status(201).render("announcements", {
        announcements: updatedResult.rows,
        events: eventsResult.rows,
        user: req.user,
        error: null,
        success: "Announcement posted successfully!",
      });
    } catch (err) {
      console.error("Error posting announcement:", err);
      const organizerEmail = req.user.email;
      const eventsResult = await db.query(
        `
        SELECT event_id, event_name 
        FROM events 
        WHERE organizer_email = $1 AND event_date >= NOW() 
        ORDER BY event_date ASC
        `,
        [organizerEmail]
      );

      res.status(500).render("announcements", {
        announcements: [],
        events: eventsResult.rows,
        user: req.user,
        error: "Failed to post announcement: " + err.message,
        success: null,
      });
    }
  }
);

app.delete("/announcements/:id", ensureAuthenticated, async (req, res) => {
  if (req.user.role !== "organizer") {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  const organizerEmail = req.user.email;

  try {
    const announcementResult = await db.query(
      `
      SELECT image_path, video_path
      FROM announcements
      WHERE id = $1 AND organizer_email = $2
      `,
      [id, organizerEmail]
    );

    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    const { image_path, video_path } = announcementResult.rows[0];

    await db.query(
      `
      DELETE FROM announcements
      WHERE id = $1 AND organizer_email = $2
      `,
      [id, organizerEmail]
    );

    if (image_path) {
      await fs.unlink(image_path).catch((err) => console.error("Error deleting image:", err));
    }
    if (video_path) {
      await fs.unlink(video_path).catch((err) => console.error("Error deleting video:", err));
    }

    res.status(200).json({ success: "Announcement deleted successfully" });
  } catch (err) {
    console.error("Error deleting announcement:", err);
    res.status(500).json({ error: "Failed to delete announcement" });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { fullname: name, email, password, role } = req.body;

    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (checkResult.rows.length > 0) {
      return res.status(409).render("register", {
        msg: "This email already exists",
      });
    }

    const hash = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "INSERT INTO users(name, email, password, role) VALUES($1, $2, $3, $4) RETURNING *",
      [name, email, hash, role]
    );

    const user = result.rows[0];
    req.login(user, (err) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).render("register", {
          msg: "Registration failed",
        });
      }
      const redirectTo = role === "participant" ? "/participant" : "/organizer";
      return res.status(302).redirect(`${redirectTo}?success=Successfully registered!`);
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).render("register", {
      msg: "Server error",
    });
  }
});

// ... (previous imports and setup remain unchanged)

// Updated Passport configuration
passport.use(
  "local",
  new Strategy(
    {
      usernameField: "email",
    },
    async (email, password, cb) => {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if (!result.rows.length) {
          return cb(null, false, { message: "User not found" });
        }

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
          return cb(null, false, { message: "Incorrect password" });
        }

        return cb(null, user);
      } catch (err) {
        return cb(err);
      }
    }
  )
);

// Updated /login POST route
app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureMessage: true, // Enable failure messages
  }),
  (req, res) => {
    const redirectTo = req.user.role === "participant" ? "/participant" : "/organizer";
    res.status(302).redirect(`${redirectTo}?success=Successfully logged in`);
  }
);

// Updated /login GET route to pass error messages
app.get("/login", (req, res) => {
  const messages = req.session.messages || []; // Get messages from Passport
  const msg = messages.length > 0 ? messages[messages.length - 1] : null; // Get the latest message
  res.status(200).render("login", { msg });
});

// ... (rest of your index.js code remains unchanged)
passport.serializeUser((user, cb) => {
  cb(null, { id: user.id, role: user.role });
});

passport.deserializeUser(async (user, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [user.id]);
    cb(null, result.rows[0]);
  } catch (err) {
    cb(err);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
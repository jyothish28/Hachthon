CREATE TABLE events (
    event_id SERIAL PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    event_description TEXT,
    organizer_email VARCHAR(255) NOT NULL,
    organizer_name VARCHAR(100) NOT NULL,
    event_date TIMESTAMP NOT NULL,
    registration_fee DECIMAL(10,2) DEFAULT 0.00,
    registration_start_date TIMESTAMP NOT NULL,
    registration_expiry_date TIMESTAMP NOT NULL,
    max_participants INTEGER NOT NULL CHECK (max_participants > 0),
    event_location VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_date_range 
        CHECK (registration_start_date <= registration_expiry_date),
    CONSTRAINT valid_event_date 
        CHECK (registration_expiry_date <= event_date)
);

-- Create indexes for better query performance
CREATE INDEX idx_events_organizer_email ON events(organizer_email);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_registration_period ON events(registration_start_date, registration_expiry_date);




CREATE TABLE event_registrations (
    registration_id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (event_id, user_id)
);


CREATE TABLE project_submissions (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    project_url VARCHAR(255) NOT NULL,
    project_description TEXT NOT NULL,
    file_path VARCHAR(255), -- Path to the uploaded file (optional)
    submitted_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (event_id) REFERENCES events(event_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);


CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    organizer_email VARCHAR(255) NOT NULL,
    event_id INTEGER REFERENCES events(event_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_path VARCHAR(255),
    video_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organizer_email) REFERENCES users(email)
);
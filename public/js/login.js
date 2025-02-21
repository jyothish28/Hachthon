document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector(".signin-form");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    // Password toggle feature
   

    // Form validation before submission
    form.addEventListener("submit", (event) => {
        let valid = true;

        // Username validation
        if (usernameInput.value.trim() === "") {
            alert("Username cannot be empty!");
            valid = false;
        }

        // Password validation
        if (passwordInput.value.length < 6) {
            alert("Password must be at least 6 characters!");
            valid = false;
        }

        if (!valid) {
            event.preventDefault(); // Stop form submission if invalid
        }
    });
});

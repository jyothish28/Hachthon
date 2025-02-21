document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector(".signup-form");
    const roleSelect = document.getElementById("role");
    const fullnameInput = document.getElementById("fullname");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    // Password strength indicator
    const strengthIndicator = document.createElement("p");
    strengthIndicator.style.fontSize = "14px";
    strengthIndicator.style.marginTop = "5px";
    passwordInput.parentElement.appendChild(strengthIndicator);

    passwordInput.addEventListener("input", () => {
        const password = passwordInput.value;
        if (password.length < 6) {
            strengthIndicator.textContent = "Weak 🔴";
            strengthIndicator.style.color = "red";
        } else if (password.length < 10) {
            strengthIndicator.textContent = "Medium 🟠";
            strengthIndicator.style.color = "orange";
        } else {
            strengthIndicator.textContent = "Strong 🟢";
            strengthIndicator.style.color = "green";
        }
    });

    // Form validation before submission
    form.addEventListener("submit", (event) => {
        let valid = true;

        // Full name validation
        if (fullnameInput.value.trim().length < 3) {
            alert("Full name must be at least 3 characters!");
            valid = false;
        }

        // Email validation based on role
        const participantEmailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const organiserEmailPattern = /^[0-9a-zA-Z]+@mbu\.asia$/;

        if (roleSelect.value === "participant" && !participantEmailPattern.test(emailInput.value)) {
            alert("Enter a valid email address!");
            valid = false;
        }

        if (roleSelect.value === "organizer" && !organiserEmailPattern.test(emailInput.value)) {
            alert("Organizer email must be in the format 22102a040817@mbu.asia!");
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

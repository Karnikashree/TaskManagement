document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullname = document.getElementById("full-name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullname,
        },
      },
    });

    if (error) throw error;

    showToast("Registration successful! You can now login.", "success");

    setTimeout(() => {
      window.location.href = "lobby.html";
    }, 2000);
  } catch (error) {
    showToast(error.message, "error");
  }
});

const togglePassword = document.getElementById("togglePassword");
const passwordInput = document.getElementById("password");

if (togglePassword && passwordInput) {
  togglePassword.addEventListener("click", function () {
    const type =
      passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);
    this.classList.toggle("fa-eye");
    this.classList.toggle("fa-eye-slash");
  });
}

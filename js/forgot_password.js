document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgot-password-form");
  const resetBtn = document.getElementById("reset-btn");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;

    setLoading(resetBtn, true, "Send Reset Link");

    try {
      const redirectUrl = window.location.origin + "/update_password.html";

      console.log("Using redirect URL:", redirectUrl);

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      showToast("Password reset link sent! Check your email.", "success");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2000);
    } catch (error) {
      console.error("Error sending reset link:", error);
      showToast(`Error: ${error.message}`, "error");
    } finally {
      setLoading(resetBtn, false);
    }
  });
});

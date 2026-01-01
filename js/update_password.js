document.addEventListener("DOMContentLoaded", async () => {
  setTimeout(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      showToast("Invalid or expired reset link. Please try again.", "error");
      setTimeout(() => {
        window.location.href = "forgot_password.html";
      }, 2000);
      return;
    }
  }, 1000);

  const form = document.getElementById("update-password-form");
  const updateBtn = document.getElementById("update-btn");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = document.getElementById("password").value;
      const confirmPassword = document.getElementById("confirm-password").value;

      if (password !== confirmPassword) {
        showToast("Passwords do not match", "error");
        return;
      }

      setLoading(updateBtn, true, "Update Password");

      try {
        const { error } = await supabase.auth.updateUser({
          password: password,
        });

        if (error) throw error;

        showToast(
          "Password updated successfully! Redirecting to login...",
          "success"
        );
        await supabase.auth.signOut();
        setTimeout(() => {
          window.location.href = "login.html";
        }, 2000);
      } catch (error) {
        console.error("Error updating password:", error);
        showToast(`Error: ${error.message}`, "error");
      } finally {
        setLoading(updateBtn, false);
      }
    });
  }
});

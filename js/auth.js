async function checkAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const path = window.location.pathname;

  if (!session) {
    const isPublicPage =
      path.includes("login.html") ||
      path.includes("signup.html") ||
      path.endsWith("/") ||
      path.includes("index.html");
    if (!isPublicPage) {
      window.location.href = "login.html";
      return null;
    }
  } else {
    const isPublicPage =
      path.includes("login.html") ||
      path.includes("signup.html") ||
      path.endsWith("/") ||
      path.includes("index.html");
    if (isPublicPage) {
      window.location.href = "lobby.html";
    }
  }
  return session?.user;
}

window.logout = async function () {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.href = "index.html";
  } catch (error) {
    console.error("Error signing out:", error);
    alert("Error signing out: " + error.message);
  }
};

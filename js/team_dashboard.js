let currentUser = null;
let currentTeamId = null;

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await checkAuth();
  if (!currentUser) return;

  const urlParams = new URLSearchParams(window.location.search);
  currentTeamId = urlParams.get("teamId");

  if (!currentTeamId) {
    window.location.href = "lobby.html";
    return;
  }

  updateUserInterface();
  updateSidebarLinks();
  loadTeamDetails();
  loadDashboardStats();
  loadAdminViewButton();
});

async function loadAdminViewButton() {
  try {
    const { data: member, error } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", currentTeamId)
      .eq("user_id", currentUser.id)
      .single();

    if (error && error.code !== "PGRST116")
      console.error("Error checking admin role:", error);

    if (member && member.role === "admin") {
      const userDropdown = document.querySelector(".user-dropdown");
      if (userDropdown) {
        const btn = document.createElement("a");
        btn.href = `admin_dashboard.html?teamId=${currentTeamId}`;
        btn.innerHTML = '<i class="fa fa-cogs"></i> Admin View';
        btn.style.cssText =
          "color: white; font-weight: 600; margin-left: 15px; text-decoration: none; border: 1px solid rgba(255,255,255,0.3); padding: 5px 10px; border-radius: 4px;";
        userDropdown.appendChild(btn);
      }
    }
  } catch (err) {
    console.error("Failed to load admin button:", err);
  }
}

function updateSidebarLinks() {
  const links = ["nav-dashboard", "nav-tasks", "nav-members", "nav-brand"];
  links.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const base = el.getAttribute("href").split("?")[0];
      el.setAttribute("href", `${base}?teamId=${currentTeamId}`);
    }
  });
}

function updateUserInterface() {
  const email = currentUser.email;
  const fullName = currentUser?.user_metadata?.full_name || email.split("@")[0];
  const initial = fullName.charAt(0).toUpperCase();

  document.getElementById("user-avatar").textContent = initial;
  document.getElementById("user-info").textContent = fullName;
}

window.copyTeamId = function () {
  if (!currentTeamId) return;
  navigator.clipboard.writeText(currentTeamId).then(() => {
    showToast("Team ID copied!", "success");
  });
};

async function loadTeamDetails() {
  try {
    const { data: team, error } = await supabase
      .from("teams")
      .select("name")
      .eq("id", currentTeamId)
      .single();

    if (error) throw error;

    if (team) {
      document.getElementById("team-title").textContent =
        team.name + " (Member)";
      document.title = `${team.name} - Member Dashboard`;
    }
  } catch (error) {
    console.error("Error loading team details:", error);
    if (error.code === "PGRST116") {
      alert("Team not found or access denied. Check database policies.");
    } else {
      alert(`Error loading team: ${error.message}`);
    }
  }
}

async function loadDashboardStats() {
  try {
    const { data: tasks, error: taskError } = await supabase
      .from("tasks")
      .select("status, assigned_to")
      .eq("team_id", currentTeamId);

    if (taskError) throw taskError;

    const myTasks = tasks.filter((t) => t.assigned_to === currentUser.id);
    const myTotal = myTasks.length;
    const myPending = myTasks.filter((t) => t.status === "pending").length;
    const myInProgress = myTasks.filter(
      (t) => t.status === "in-progress"
    ).length;
    const myCompleted = myTasks.filter((t) => t.status === "completed").length;
    const myActive = myPending + myInProgress;

    document.getElementById("my-active-count").textContent = myActive;
    document.getElementById("my-pending-count").textContent = myPending;
    document.getElementById("my-completed-count").textContent = myCompleted;

    const rate = myTotal > 0 ? Math.round((myCompleted / myTotal) * 100) : 0;
    document.getElementById("my-completion-rate").textContent = `${rate}%`;

    updateChart("pending", myPending, myTotal);
    updateChart("progress", myInProgress, myTotal);
    updateChart("completed", myCompleted, myTotal);
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

function updateChart(type, count, total) {
  const width = total > 0 ? (count / total) * 100 : 0;
  const el = document.getElementById(`chart-fill-${type}`);
  const countEl = document.getElementById(`chart-${type}`);

  if (el) el.style.width = `${width}%`;
  if (countEl) countEl.textContent = count;
}

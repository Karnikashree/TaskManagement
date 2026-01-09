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

  document.getElementById("team-id-display").textContent = currentTeamId;
  updateUserInterface();
  updateSidebarLinks();
  loadTeamDetails();
  loadDashboardStats();
  injectProjectsDropdown();
  loadAdminProjectsDropdown();
  loadMemberViewButton();
});

function injectProjectsDropdown() {
  const userDropdown = document.querySelector(".user-dropdown");
  if (userDropdown) {
    const span = document.createElement("span");
    span.className = "dropdown";
    span.style.marginLeft = "15px";
    span.innerHTML = `
            <a href="#" class="dropdown-toggle project-btn-link" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false" style="text-decoration: none; color: white;">
                <span class="nav-btn-style"><i class="fa fa-folder-open"></i> Projects <span class="caret"></span></span>
            </a>
            <ul class="dropdown-menu" id="admin-projects-dropdown" style="right: 0; left: auto;">
                <li><a href="#">Loading...</a></li>
            </ul>
        `;
    userDropdown.appendChild(span);
  }
}

async function loadAdminProjectsDropdown() {
  const dropdown = document.getElementById("admin-projects-dropdown");
  if (!dropdown) return;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships, error } = await supabase
      .from("team_members")
      .select(
        `
                team_id,
                teams:team_id(id, name)
            `
      )
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (error) throw error;

    dropdown.innerHTML = "";

    memberships.forEach((m) => {
      if (m.teams) {
        const li = document.createElement("li");
        li.innerHTML = `<a href="admin_dashboard.html?teamId=${m.teams.id}">${m.teams.name}</a>`;
        dropdown.appendChild(li);
      }
    });
  } catch (e) {
    console.error("Error loading projects dropdown:", e);
    dropdown.innerHTML = '<li><a href="#">Error loading projects</a></li>';
  }
}

function loadMemberViewButton() {
  const userDropdown = document.querySelector(".user-dropdown");
  if (userDropdown) {
    const btn = document.createElement("a");
    btn.href = "#";
    btn.onclick = (e) => {
      e.preventDefault();
      goToMemberView();
    };
    btn.innerHTML = '<i class="fa fa-eye"></i> Member View';
    btn.style.cssText =
      "color: white; font-weight: 600; margin-left: 15px; text-decoration: none; border: 1px solid rgba(255,255,255,0.3); padding: 5px 10px; border-radius: 4px; cursor: pointer;";

    userDropdown.appendChild(btn);
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

window.goToMemberView = function () {
  if (!currentTeamId) {
    alert("Team ID missing");
    return;
  }
  window.location.href = `team_dashboard.html?teamId=${currentTeamId}`;
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
        team.name + " (Admin)";
    }
  } catch (error) {
    console.error("Error loading team details:", error);
    if (error.code === "PGRST116") {
      alert("Team not found or access denied (RLS).");
    } else {
      alert(`Error loading team: ${error.message}`);
    }
  }
}

async function loadDashboardStats() {
  try {
    const { data: tasks, error: taskError } = await supabase
      .from("tasks")
      .select("status, priority")
      .eq("team_id", currentTeamId);

    if (taskError) throw taskError;

    const totalTasks = tasks.length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in-progress").length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const highPriority = tasks.filter((t) => t.priority === "high").length;

    document.getElementById("total-tasks-count").textContent = totalTasks;

    const highPriorityEl = document.getElementById("high-priority-count");
    if (highPriorityEl) highPriorityEl.textContent = highPriority;

    const rate =
      totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
    document.getElementById("completion-rate").textContent = `${rate}%`;

    updateChart("pending", pending, totalTasks);
    updateChart("progress", inProgress, totalTasks);
    updateChart("completed", completed, totalTasks);

    const { count: memberCount, error: memberError } = await supabase
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", currentTeamId);

    if (memberError) throw memberError;

    document.getElementById("total-members-count").textContent = memberCount;

    loadRecentActivity();
  } catch (error) {
    console.error("Error loading stats:", error);
    showToast("Error loading dashboard stats", "error");
  }
}

async function loadRecentActivity() {
  const feed = document.getElementById("recent-activity-feed");
  if (!feed) return;

  try {
    const { data: recentTasks, error } = await supabase
      .from("tasks")
      .select(
        `
                *,
                assigned_to:profiles!tasks_assigned_to_fkey(full_name)
            `
      )
      .eq("team_id", currentTeamId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!recentTasks || recentTasks.length === 0) {
      feed.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa fa-history"></i></div>
                    <p>No recent activity found.</p>
                </div>`;
      return;
    }

    let html = "";
    recentTasks.forEach((task) => {
      const timeAgo = new Date(task.created_at).toLocaleDateString();
      const assigneeName = task.assigned_to
        ? task.assigned_to.full_name
        : "Unassigned";

      html += `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fa fa-tasks"></i>
                    </div>
                    <div class="activity-content">
                        <p><strong>${task.title}</strong> was created</p>
                        <small>Assigned to: ${assigneeName} &bull; ${timeAgo}</small>
                    </div>
                </div>
            `;
    });

    feed.innerHTML = html;
  } catch (err) {
    console.error("Error loading activity:", err);
    feed.innerHTML = '<p class="text-danger">Failed to load activity.</p>';
  }
}

function updateChart(type, count, total) {
  const width = total > 0 ? (count / total) * 100 : 0;
  const el = document.getElementById(`chart-fill-${type}`);
  const countEl = document.getElementById(`chart-${type}`);

  if (el) el.style.width = `${width}%`;
  if (countEl) countEl.textContent = count;
}

function confirmDeleteTeam() {
  $("#deleteTeamModal").modal("show");
}

document
  .getElementById("delete-confirm-input")
  .addEventListener("input", function (e) {
    const btn = document.getElementById("btn-delete-team-service");
    if (e.target.value === "DELETE") {
      btn.disabled = false;
    } else {
      btn.disabled = true;
    }
  });

async function executeDeleteTeam() {
  const btn = document.getElementById("btn-delete-team-service");
  setLoading(btn, true, "Delete Team");

  try {
    const { error } = await supabase
      .from("teams")
      .delete()
      .eq("id", currentTeamId);

    if (error) throw error;

    $("#deleteTeamModal").modal("hide");
    showToast("Team deleted successfully. Redirecting...", "success");

    setTimeout(() => {
      window.location.href = "lobby.html";
    }, 1500);
  } catch (error) {
    console.error("Error deleting team:", error);
    showToast("Error deleting team: " + error.message, "error");
    setLoading(btn, false);
  }
}

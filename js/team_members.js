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
  loadMembers();
  loadStats();
  loadAdminViewButton();
});

function updateUserInterface() {
  const email = currentUser.email;
  const fullName = currentUser?.user_metadata?.full_name || email.split("@")[0];
  const initial = fullName.charAt(0).toUpperCase();

  if (document.getElementById("user-avatar"))
    document.getElementById("user-avatar").textContent = initial;
  if (document.getElementById("user-info"))
    document.getElementById("user-info").textContent = fullName;
}

function updateSidebarLinks() {
  const links = ["nav-dashboard", "nav-tasks", "nav-members", "nav-subscription", "nav-brand"];
  links.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const base = el.getAttribute("href").split("?")[0];
      el.setAttribute("href", `${base}?teamId=${currentTeamId}`);
    }
  });
}

async function loadTeamDetails() {
  const { data: team } = await supabase
    .from("teams")
    .select("name")
    .eq("id", currentTeamId)
    .single();
  if (team) {
    document.getElementById("team-title").textContent = team.name + " (Member)";
  }
}

async function loadAdminViewButton() {
  try {
    const { data: member } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", currentTeamId)
      .eq("user_id", currentUser.id)
      .single();

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
  } catch (e) {
    console.error(e);
  }
}


async function loadMembers() {
  const tbody = document.getElementById("members-table-body");
  tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading members...</td></tr>';

  try {
    const { data: members, error } = await supabase
      .from("team_members")
      .select("user_id, role, joined_at, profiles(email, full_name)")
      .eq("team_id", currentTeamId);

    if (error) throw error;

    const { data: tasks } = await supabase
      .from("tasks")
      .select("assigned_to, status")
      .eq("team_id", currentTeamId);

    const taskCounts = {};
    if (tasks) {
      tasks.forEach(t => {
        if (!t.assigned_to) return;
        if (!taskCounts[t.assigned_to]) taskCounts[t.assigned_to] = 0;
        if (t.status !== 'completed') taskCounts[t.assigned_to]++;
      });
    }

    tbody.innerHTML = "";
    members.forEach(m => {
      const profile = m.profiles || {};
      const name = profile.full_name || "Unknown";
      const email = profile.email || "No Email";
      const joined = new Date(m.joined_at).toLocaleDateString();
      const count = taskCounts[m.user_id] || 0;
      const roleLabel = m.role === 'admin' ? '<span class="label label-danger">Admin</span>' : '<span class="label label-info">Member</span>';

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>${name}</td>
                <td style="vertical-align: middle;">${email}</td>
                <td style="vertical-align: middle;">${roleLabel}</td>
                <td style="vertical-align: middle;">${joined}</td>
                <td style="vertical-align: middle;"><span class="badge">${count} Pending</span></td>
            `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Error loading members:", err);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading members</td></tr>';
  }
}

async function loadStats() {
  try {
    const { count } = await supabase
      .from("team_members")
      .select("*", { count: 'exact', head: true })
      .eq("team_id", currentTeamId);

    document.getElementById("total-members").textContent = count || 0;
    document.getElementById("active-count").textContent = count || 0; 
  } catch (e) {
    console.error(e);
  }
}

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
  Promise.all([
    loadTeamDetails(),
    loadMembers(),
    loadStats(),
    loadAdminViewButton(),
  ]);
});

async function loadAdminViewButton() {
  try {
    const { data: member, error } = await supabase
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
  const links = ["nav-dashboard", "nav-tasks", "nav-members", "nav-brand"];
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
    document.title = `${team.name} - Team Members`;
  }
}

async function loadMembers() {
  const tbody = document.getElementById("members-table-body");
  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

  try {
    const { data: members, error } = await supabase
      .from("team_members")
      .select("*, profiles(email, full_name)")
      .eq("team_id", currentTeamId);

    if (error) throw error;

    const { data: tasks } = await supabase
      .from("tasks")
      .select("assigned_to")
      .eq("team_id", currentTeamId);

    tbody.innerHTML = "";
    const currentUserRole = members.find(
      (m) => m.user_id === currentUser.id
    )?.role;
    const isAdmin = currentUserRole === "admin";

    tbody.innerHTML = "";

    members.forEach((m) => {
      const taskCount = tasks.filter((t) => t.assigned_to === m.user_id).length;
      const name = m.profiles.full_name || "N/A";
      const email = m.profiles.email;


      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <strong>${name}</strong>
                    </div>
                </td>
                <td>${email}</td>
                <td><span class="label label-${m.role === "admin" ? "primary" : "default"
        }">${m.role}</span></td>
                <td>${new Date(m.joined_at).toLocaleDateString()}</td>
                <td>${taskCount}</td>
            `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-danger">Error loading members</td></tr>';
  }
}

window.removeMember = async function (uid) {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id")
    .eq("assigned_to", uid)
    .eq("team_id", currentTeamId)
    .neq("status", "completed");

  if (tasks && tasks.length > 0) {
    document.getElementById("reassign-task-count").textContent = tasks.length;
    document.getElementById("reassign-remove-uid").value = uid;

    const sel = document.getElementById("reassign-select");
    sel.innerHTML =
      '<option value="">-- Unassign (Set to Unassigned) --</option>';

    const { data: others } = await supabase
      .from("team_members")
      .select("profiles(full_name, email), user_id")
      .eq("team_id", currentTeamId)
      .neq("user_id", uid);

    if (others) {
      others.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.user_id;
        opt.textContent = m.profiles.full_name || m.profiles.email;
        sel.appendChild(opt);
      });
    }

    $("#reassignModal").modal("show");
  } else {
    if (confirm("Remove this member?")) {
      await executeRemove(uid);
    }
  }
};

async function executeRemove(uid) {
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", currentTeamId)
    .eq("user_id", uid);
  if (error) {
    showToast("Error removing member", "error");
  } else {
    showToast("Member removed", "success");
    loadMembers();
    loadStats();
  }
}

if (document.getElementById("reassign-form")) {
  document
    .getElementById("reassign-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const oldUid = document.getElementById("reassign-remove-uid").value;
      const newUid = document.getElementById("reassign-select").value || null;

      const { error } = await supabase
        .from("tasks")
        .update({ assigned_to: newUid })
        .eq("assigned_to", oldUid)
        .eq("team_id", currentTeamId)
        .neq("status", "completed");

      if (error) {
        console.error("Reassign error:", error);
        showToast("Reassign failed", "error");
        return;
      }

      await executeRemove(oldUid);
      $("#reassignModal").modal("hide");
    });
}
window.removeMember = removeMember;

async function loadStats() {
  const { data: members } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", currentTeamId);

  if (members) {
    document.getElementById("total-members").textContent = members.length;
    document.getElementById("active-count").textContent = members.length;
  }
}

window.copyTeamId = function () {
  if (!currentTeamId) return;
  navigator.clipboard.writeText(currentTeamId).then(() => {
    showToast("Team ID copied!", "success");
  });
};

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
  loadMembers();
  loadStats();
  injectProjectsDropdown();
  loadAdminProjectsDropdown();
  loadMemberViewButton();
  loadAvailableUsers();
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

    const { data: memberships, error: memError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (memError) throw memError;

    if (!memberships || memberships.length === 0) {
      dropdown.innerHTML = '<li><a href="#">No projects found</a></li>';
      return;
    }

    const teamIds = memberships.map((m) => m.team_id);

    const { data: teams, error } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds)
      .order("name");

    if (error) throw error;

    dropdown.innerHTML = "";

    teams.forEach((team) => {
      const li = document.createElement("li");
      li.innerHTML = `<a href="admin_dashboard.html?teamId=${team.id}">${team.name}</a>`;
      dropdown.appendChild(li);
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
    document.getElementById("team-title").textContent = team.name + " (Admin)";
  }
}

async function loadMembers() {
  const tbody = document.getElementById("members-table-body");
  tbody.innerHTML =
    '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

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
                <td><span class="label label-${
                  m.role === "admin" ? "primary" : "default"
                }">${m.role}</span></td>
                <td>${new Date(m.joined_at).toLocaleDateString()}</td>
                <td>${taskCount}</td>
                <td>
                    ${getActionButtons(m)}
                </td>
            `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Error loading members:", e);
    const msg =
      e.code === "500" || e.status === 500
        ? "Server Error (500). Please run the 'fix_rls_policies.sql' script in Supabase."
        : "Error loading members";
    tbody.innerHTML = `<tr><td colspan="6" class="text-danger">${msg}</td></tr>`;
  }
}

function getActionButtons(member) {
  if (member.user_id === currentUser.id)
    return '<span class="text-muted">It\'s You</span>';

  return `
        <button class="btn btn-xs btn-danger" onclick="removeMember('${member.user_id}')" title="Remove"><i class="fa fa-times"></i></button>
    `;
}

window.searchMembers = function () {
  const input = document.getElementById("member-search-input");
  const filter = input.value.toLowerCase();
  const table = document.getElementById("members-table-body");
  const tr = table.getElementsByTagName("tr");

  for (let i = 0; i < tr.length; i++) {
    if (tr[i].cells.length < 2) continue;

    const nameCell = tr[i].getElementsByTagName("td")[0];
    const emailCell = tr[i].getElementsByTagName("td")[1];

    if (nameCell && emailCell) {
      const nameText = nameCell.textContent || nameCell.innerText;
      const emailText = emailCell.textContent || emailCell.innerText;

      if (
        nameText.toLowerCase().indexOf(filter) > -1 ||
        emailText.toLowerCase().indexOf(filter) > -1
      ) {
        tr[i].style.display = "";
      } else {
        tr[i].style.display = "none";
      }
    }
  }
};

async function loadStats() {
  const { data: members } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", currentTeamId);

  if (members) {
    document.getElementById("total-members").textContent = members.length;
    document.getElementById("admin-count").textContent = members.filter(
      (m) => m.role === "admin"
    ).length;
    document.getElementById("member-count").textContent = members.filter(
      (m) => m.role === "member"
    ).length;
    document.getElementById("active-count").textContent = members.length;
  }
}

document
  .getElementById("add-member-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const select = document.getElementById("new-member-select");
    const userId = select.value;

    if (!userId) {
      showToast("Please select a user to add", "error");
      return;
    }

    await addExistingUser(userId);
    $("#addMemberModal").modal("hide");
    select.value = "";
  });

async function addExistingUser(uid) {
  try {
    const { error } = await supabase.from("team_members").insert({
      team_id: currentTeamId,
      user_id: uid,
      role: "member",
    });

    if (error) throw error;

    showToast("Member added successfully", "success");
    loadMembers();
    loadStats();
    loadAvailableUsers();
  } catch (err) {
    console.error("Error adding member:", err);
    showToast("Failed to add member", "error");
  }
}

async function loadAvailableUsers() {
  const select = document.getElementById("new-member-select");
  if (!select) return;

  select.innerHTML = '<option value="">Loading users...</option>';

  try {
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", currentTeamId);
    const memberIds = members ? members.map((m) => m.user_id) : [];

    const { data: users } = await supabase.from("profiles").select("*");

    if (!users) {
      select.innerHTML = '<option value="">Failed to load users</option>';
      return;
    }

    const availableUsers = users.filter((u) => !memberIds.includes(u.id));

    if (availableUsers.length === 0) {
      select.innerHTML = '<option value="">No other users found</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Select a User --</option>';
    availableUsers.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = `${u.full_name || "No Name"} (${u.email})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading available users:", err);
    select.innerHTML = '<option value="">Error loading users</option>';
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
      '<option value="">-- Unassign (Set to Unassigned) --</option>'; // Add Unassign option

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
    loadAvailableUsers();
  }
}

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

window.goToMemberView = function () {
  if (!currentTeamId) return;
  window.location.href = `team_dashboard.html?teamId=${currentTeamId}`;
};

window.copyTeamId = function () {
  if (!currentTeamId) return;
  navigator.clipboard.writeText(currentTeamId).then(() => {
    showToast("Team ID copied!", "success");
  });
};

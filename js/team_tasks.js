let currentUser = null;
let currentTeamId = null;
let allTasks = [];

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
  loadMembersForSelect();
  loadTeamDetails();
  loadTasks();
  setupFilters();
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
    document.title = `${team.name} - My Tasks`;
  }
}

function setupFilters() {
  const filters = ["filter-status", "filter-priority"];
  filters.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", applyFilters);
  });
}

function applyFilters() {
  const status = document.getElementById("filter-status").value;
  const priority = document.getElementById("filter-priority").value;

  const filtered = allTasks.filter((task) => {
    const matchStatus = status === "all" || task.status === status;
    const matchPriority =
      priority === "all" || (task.priority || "medium") === priority;
    return matchStatus && matchPriority;
  });

  const myTasks = filtered.filter((t) => t.assigned_to === currentUser.id);
  const otherTasks = filtered.filter((t) => t.assigned_to !== currentUser.id);

  renderTaskTable(myTasks, "my-task-list-body", false);
  renderTaskTable(otherTasks, "team-task-list-body", true);
}

window.clearFilters = function () {
  document.getElementById("filter-status").value = "all";
  document.getElementById("filter-priority").value = "all";
  applyFilters();
};

async function loadTasks() {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, profiles!tasks_assigned_to_fkey(email, full_name, id)")
    .eq("team_id", currentTeamId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading tasks:", error);
    showToast("Error loading tasks", "error");
    return;
  }

  allTasks = tasks || [];
  applyFilters();
}

function renderTaskTable(tasks, tbodyId, showAssignee) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = "";

  if (tasks.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center text-muted">No tasks found</td></tr>';
    return;
  }

  tasks.forEach((task) => {
    let assigneeName = "Unassigned";
    if (task.profiles) {
      assigneeName = task.profiles.full_name || task.profiles.email;
    }

    const isOwner = task.created_by === currentUser.id;
    const isAssignee = task.assigned_to === currentUser.id;
    const canEdit = isAssignee;

    let actions = "";
    if (canEdit && !showAssignee) {
      actions += `<button class="btn btn-xs btn-primary btn-action" onclick="enableInlineEdit('${task.id}')" title="Edit Task">
                            <i class="fa fa-pencil"></i>
                        </button>`;
    }

    let assigneeCell = "";
    if (showAssignee) {
      assigneeCell = `<td>${assigneeName}</td>`;
    }

    let actionsCell = "";
    if (!showAssignee) {
      actionsCell = `<td class="action-cell">${actions}</td>`;
    }

    const tr = document.createElement("tr");
    tr.id = `task-row-${task.id}`;
    tr.innerHTML = `
            <td><strong>${task.title}</strong></td>
            <td><small>${task.description || ""}</small></td>
            ${assigneeCell}
            <td data-field="status"><span class="label label-${getStatusColor(
              task.status
            )}">${task.status}</span></td>
            <td data-field="priority"><span class="badge mb-0 priority-${
              task.priority || "medium"
            }">${task.priority || "medium"}</span></td>
            <td>${
              task.due_date ? new Date(task.due_date).toLocaleDateString() : "-"
            }</td>
            ${actionsCell}
        `;
    tbody.appendChild(tr);
  });
}

function getStatusColor(status) {
  if (status === "pending") return "warning";
  if (status === "in-progress") return "info";
  if (status === "completed") return "success";
  return "default";
}

async function loadMembersForSelect() {
  const selects = [
    document.getElementById("edit-task-assignee"),
    document.getElementById("filter-assignee"),
  ];

  try {
    const { data: members, error } = await supabase
      .from("team_members")
      .select("user_id, profiles(email, full_name)")
      .eq("team_id", currentTeamId);

    if (error) throw error;

    members.forEach((m) => {
      const name = m.profiles.full_name || m.profiles.email;
      selects.forEach((sel) => {
        if (!sel) return;
        const opt = document.createElement("option");
        opt.value = m.user_id;
        opt.textContent = name;
        if (m.user_id === currentUser.id) {
          opt.textContent += " (Me)";
        }
        sel.appendChild(opt);
      });
    });
  } catch (e) {
    console.error("Error loading members for select:", e);
  }
}

window.enableInlineEdit = function (taskId) {
  const row = document.getElementById(`task-row-${taskId}`);
  if (!row) return;

  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  const statusCell = row.children[2];
  statusCell.innerHTML = `
        <select class="form-control" id="edit-status-${taskId}" style="height: 30px; padding: 0 5px; font-size: 12px; width: 100%;">
            <option value="pending" ${
              task.status === "pending" ? "selected" : ""
            }>Pending</option>
            <option value="in-progress" ${
              task.status === "in-progress" ? "selected" : ""
            }>In Progress</option>
            <option value="completed" ${
              task.status === "completed" ? "selected" : ""
            }>Completed</option>
        </select>
    `;

  const actionsCell = row.children[5];
  actionsCell.innerHTML = `
        <button class="btn btn-xs btn-success" onclick="saveInlineEdit('${taskId}')" title="Save">
            <i class="fa fa-check"></i>
        </button>
        <button class="btn btn-xs btn-default" onclick="cancelInlineEdit()" title="Cancel">
            <i class="fa fa-times"></i>
        </button>
    `;
};

window.cancelInlineEdit = function () {
  applyFilters();
};

window.saveInlineEdit = async function (taskId) {
  const newStatus = document.getElementById(`edit-status-${taskId}`).value;

  const { error } = await supabase
    .from("tasks")
    .update({ status: newStatus })
    .eq("id", taskId);

  if (error) {
    showToast("Update failed", "error");
    return;
  }

  const taskIndex = allTasks.findIndex((t) => t.id === taskId);
  if (taskIndex !== -1) {
    allTasks[taskIndex].status = newStatus;
  }

  showToast("Task updated successfully", "success");
  applyFilters();
};

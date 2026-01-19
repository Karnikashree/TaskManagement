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

  document.getElementById("team-id-display").textContent = currentTeamId;
  updateUserInterface();
  updateSidebarLinks();
  loadMembersForSelect();
  loadTeamDetails();
  loadTasks();
  injectProjectsDropdown();
  loadAdminProjectsDropdown();
  loadMemberViewButton();
  setupFilters();
  setupListeners();
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
      .eq("role", "admin")
      .order("name", { foreignTable: "teams" });

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
  const links = ["nav-dashboard", "nav-tasks", "nav-members", "nav-payments", "nav-brand"];
  links.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const base = el.getAttribute("href").split("?")[0];
      el.setAttribute("href", `${base}?teamId=${currentTeamId}`);
    }
  });
}

function setupFilters() {
  const filters = ["filter-status", "filter-assignee", "filter-priority"];
  filters.forEach((id) => {
    document.getElementById(id).addEventListener("change", applyFilters);
  });
}

function applyFilters() {
  const status = document.getElementById("filter-status").value;
  const assignee = document.getElementById("filter-assignee").value;
  const priority = document.getElementById("filter-priority").value;

  const filtered = allTasks.filter((task) => {
    const matchStatus = status === "all" || task.status === status;
    const matchAssignee =
      assignee === "all" ||
      (assignee === "unassigned" && !task.assigned_to) ||
      task.assigned_to === assignee;
    const matchPriority =
      priority === "all" || (task.priority || "medium") === priority;

    return matchStatus && matchAssignee && matchPriority;
  });

  renderListView(filtered);
}

window.clearFilters = function () {
  document.getElementById("filter-status").value = "all";
  document.getElementById("filter-assignee").value = "all";
  document.getElementById("filter-priority").value = "all";
  applyFilters();
};

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

  updateTaskStats(allTasks);

  applyFilters();
}

function updateTaskStats(tasks) {
  const total = tasks.length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const completed = tasks.filter((t) => t.status === "completed").length;

  const totalEl = document.getElementById("total-count");
  const pendingEl = document.getElementById("pending-count");
  const inProgressEl = document.getElementById("in-progress-count");
  const completedEl = document.getElementById("completed-count");

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (inProgressEl) inProgressEl.textContent = inProgress;
  if (completedEl) completedEl.textContent = completed;
}

function renderListView(tasks) {
  const tbody = document.getElementById("task-list-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  tasks.forEach((task) => {
    let assigneeName = task.profiles
      ? task.profiles.full_name || task.profiles.email
      : "Unassigned";

    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td><strong>${task.title}</strong></td>
            <td><small>${task.description || ""}</small></td>
            <td>${assigneeName}</td>
            <td><span class="label label-${getStatusColor(task.status)}">${task.status
      }</span></td>
            <td><span class="badge mb-0">${task.priority || "medium"
      }</span></td>
            <td>${task.due_date ? new Date(task.due_date).toLocaleDateString() : "-"
      }</td>
            <td>
                <button class="btn btn-xs btn-default" onclick='openEditTaskModal(${JSON.stringify(
        task
      ).replace(/'/g, "&#39;")})'>Edit</button>
                <button class="btn btn-xs btn-danger" onclick="deleteTask('${task.id
      }')">Delete</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

window.deleteTask = async function (id) {
  if (!confirm("Delete this task?")) return;
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) {
    showToast("Error deleting", "error");
    return;
  }
  showToast("Task deleted", "success");
  loadTasks();
};

window.openEditTaskModal = function (task) {
  document.getElementById("edit-task-id").value = task.id;
  document.getElementById("edit-task-title").value = task.title;
  document.getElementById("edit-task-desc").value = task.description || "";
  document.getElementById("edit-task-priority").value =
    task.priority || "medium";
  document.getElementById("edit-task-status").value = task.status;
  document.getElementById("edit-task-due-date").value = task.due_date || "";
  document.getElementById("edit-task-assignee").value = task.assigned_to || "";

  $("#editTaskModal").modal("show");
};

function getStatusColor(status) {
  if (status === "pending") return "warning";
  if (status === "in-progress") return "info";
  if (status === "completed") return "success";
  return "default";
}

async function loadMembersForSelect() {
  const selects = [
    document.getElementById("task-assignee"),
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
        sel.appendChild(opt);
      });
    });
  } catch (e) {
    console.error("Error loading members for select:", e);
  }
}

function setupListeners() {
  const todayStr = new Date().toLocaleDateString("en-CA");
  const createDateInput = document.getElementById("task-due-date");
  const editDateInput = document.getElementById("edit-task-due-date");

  if (createDateInput) createDateInput.min = todayStr;
  if (editDateInput) editDateInput.min = todayStr;

  const createForm = document.getElementById("create-task-form");
  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("Submitting Create Task Form...");

      const title = document.getElementById("task-title").value;
      const desc = document.getElementById("task-desc").value;

      let assignee = document.getElementById("task-assignee").value;
      if (assignee === "" || assignee === "unassigned") assignee = null;

      const priority = document.getElementById("task-priority").value;

      let due = document.getElementById("task-due-date").value;
      if (due) {
        const parts = due.split("-");
        const selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedDate < today) {
          showToast("Due date cannot be in the past", "error");
          return;
        }
      } else {
        due = null;
      }

      const payload = {
        team_id: currentTeamId,
        title: title,
        description: desc || null,
        assigned_to: assignee,
        priority: priority,
        status: "pending",
        due_date: due,
        created_by: currentUser.id,
      };

      console.log("Task Payload:", payload);

      try {
        const { data, error } = await supabase
          .from("tasks")
          .insert([payload])
          .select();

        if (error) {
          console.error("Supabase Error:", error);
          throw error;
        }

        console.log("Task Created:", data);

        $("#createTaskModal").modal("hide");
        e.target.reset();
        showToast("Task created successfully", "success");
        loadTasks();
      } catch (error) {
        console.error("Create Task Exception:", error);
        alert(
          `Error creating task: ${error.message || error.code || "Unknown error"
          }\nDetails: ${error.details || ""}`
        );
        showToast(`Error: ${error.message}`, "error");
      }
    });
  }

  const editForm = document.getElementById("edit-task-form");
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("edit-task-id").value;

      let assignee = document.getElementById("edit-task-assignee").value;
      if (assignee === "" || assignee === "unassigned") assignee = null;

      let due = document.getElementById("edit-task-due-date").value;
      if (due) {
        const parts = due.split("-");
        const selectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selectedDate < today) {
          showToast("Due date cannot be in the past", "error");
          return;
        }
      } else {
        due = null;
      }

      const updates = {
        title: document.getElementById("edit-task-title").value,
        description: document.getElementById("edit-task-desc").value || null,
        priority: document.getElementById("edit-task-priority").value,
        status: document.getElementById("edit-task-status").value,
        due_date: due,
        assigned_to: assignee,
      };

      try {
        const { error } = await supabase
          .from("tasks")
          .update(updates)
          .eq("id", id);

        if (error) throw error;

        $("#editTaskModal").modal("hide");
        showToast("Task updated", "success");
        loadTasks();
      } catch (error) {
        console.error("Update Task Error:", error);
        showToast(`Update failed: ${error.message}`, "error");
      }
    });
  }
}

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

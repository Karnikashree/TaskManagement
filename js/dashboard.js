let currentUser = null;
let pollerId = null;

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await checkAuth();
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }

  updateUserInterface();

  await loadTeams();
});

function updateUserInterface() {
  const email = currentUser.email;
  const fullName = currentUser?.user_metadata?.full_name || email.split("@")[0];
  const initial = fullName.charAt(0).toUpperCase();

  document.getElementById("user-avatar").textContent = initial;
  document.getElementById("user-info").textContent = fullName;

  document.getElementById(
    "welcome-title"
  ).textContent = `Welcome back, ${fullName}!`;
  document.getElementById(
    "welcome-subtitle"
  ).textContent = `Ready to collaborate? ${email}`;
}

async function loadTeams() {
  const container = document.getElementById("team-list-container");
  container.innerHTML = `
                <div class="empty-state">
                    <div class="fa fa-refresh fa-spin empty-icon"></div>
                    <h3>Loading your teams...</h3>
                    <p>Please wait while we fetch your team information</p>
                </div>`;

  try {
    const { data: memberships, error: memberError } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", currentUser.id);

    if (memberError) throw memberError;

    if (!memberships || memberships.length === 0) {
      container.innerHTML = `
                        <div class="empty-state">
                            <div class="fa fa-inbox empty-icon"></div>
                            <h3>No Teams Yet</h3>
                            <p>You haven't joined any teams yet.</p>
                            <p class="text-muted" style="margin-top: 20px;">
                                Create a new team or join an existing one to get started!
                            </p>
                        </div>`;

      document.getElementById("waiting-status").style.display = "block";
      startInvitePoller();
      return;
    }

    const teamIds = memberships.map((m) => m.team_id);
    const { data: teams, error } = await supabase
      .from("teams")
      .select("*")
      .in("id", teamIds)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!teams || teams.length === 0) {
      container.innerHTML = "<p>No team details found.</p>";
      return;
    }

    container.innerHTML = "";
    teams.forEach((team) => {
      const teamCard = document.createElement("div");
      teamCard.className = "team-card";

      teamCard.innerHTML = `
        <h4>${team.name}</h4>
        <div class="team-meta">
            <span>
                <i class="fa fa-calendar"></i>
                Created: ${new Date(team.created_at).toLocaleDateString()}
            </span>
            <button class="enter-btn"> 
                <i class="fa fa-arrow-right"></i> Enter
            </button>
        </div>
    `;

      const enterBtn = teamCard.querySelector(".enter-btn");
      enterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        enterTeam(team.id);
      });

      container.appendChild(teamCard);
    });
  } catch (error) {
    console.error("Error loading teams:", error);
    container.innerHTML = `
                    <div class="empty-state">
                        <div class="fa fa-exclamation-triangle empty-icon" style="color:#e74c3c;"></div>
                        <h3>Error Loading Teams</h3>
                        <p>Unable to load your teams. Please try refreshing the page.</p>
                        <button class="btn btn-primary" onclick="loadTeams()" style="margin-top: 20px;">
                            <i class="fa fa-refresh"></i> Retry
                        </button>
                    </div>`;
  }
}

function startInvitePoller() {
  if (pollerId) clearInterval(pollerId);

  pollerId = setInterval(async () => {
    try {
      const { data: memberships, error } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", currentUser.id);

      if (error) throw error;

      if (memberships && memberships.length > 0) {
        clearInterval(pollerId);
        const firstMembership = memberships[0];
        enterTeam(firstMembership.team_id, firstMembership.role);
      }
    } catch (error) {
      console.error("Error checking memberships:", error);
    }
  }, 4000);
}

async function enterTeam(teamId, knownRole = null) {
  try {
    let role = knownRole;

    if (!role) {
      const { data: member, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", currentUser.id)
        .single();

      if (error) throw error;
      if (member) role = member.role;
    }

    if (role === "admin") {
      window.location.href = `admin_dashboard.html?teamId=${teamId}`;
    } else {
      window.location.href = `team_dashboard.html?teamId=${teamId}`;
    }
  } catch (error) {
    if (error.code === "PGRST116") {
      console.warn(
        "Member not found in team_members, defaulting to member view or retrying...",
        error
      );

      window.location.href = `team_dashboard.html?teamId=${teamId}`;
      return;
    }

    console.error("Error entering team:", error);
    alert(`Unable to enter team: ${error.message || "Unknown error"}`);
  }
}

document
  .getElementById("create-team-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const teamName = document.getElementById("team-name").value.trim();

    if (!teamName) {
      showToast("Please enter a team name", "error");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("teams")
        .insert([
          {
            name: teamName,
            created_by: currentUser.id,
          },
        ])
        .select();

      if (error) throw error;

      $("#createTeamModal").modal("hide");
      showToast("Team created successfully", "success");

      document.getElementById("team-name").value = "";

      if (data && data[0]) {
        setTimeout(() => enterTeam(data[0].id, "admin"), 100); // reduced delay
      }
    } catch (error) {
      console.error("Error creating team:", error);
      showToast("Error creating team: " + error.message, "error");
    }
  });

document
  .getElementById("join-team-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const teamId = document.getElementById("join-team-id").value.trim();

    if (!teamId) {
      showToast("Please enter a Team ID", "error");
      return;
    }

    try {
      const { error } = await supabase.from("team_members").insert([
        {
          team_id: teamId,
          user_id: currentUser.id,
          role: "member",
        },
      ]);

      if (error) throw error;

      $("#joinTeamModal").modal("hide");
      showToast("Joined team successfully", "success");

      document.getElementById("join-team-id").value = "";

      setTimeout(() => enterTeam(teamId, "member"), 100);
    } catch (error) {
      console.error("Error joining team:", error);

      if (error.message.includes("duplicate key")) {
        showToast("You are already a member of this team!", "warning");
      } else if (error.message.includes("foreign key")) {
        showToast("Invalid Team ID. Please check and try again.", "error");
      } else if (
        error.message.includes("fetch") ||
        error.message.includes("storage")
      ) {
        const { data: check } = await supabase
          .from("team_members")
          .select("role")
          .eq("team_id", teamId)
          .eq("user_id", currentUser.id);

        if (check && check.length > 0) {
          $("#joinTeamModal").modal("hide");
          showToast("Joined team successfully (recovered)", "success");
          enterTeam(teamId, "member");
          return;
        }

        showToast("Unable to join team. Please check the Team ID.", "error");
      } else {
        showToast("Error joining team: " + error.message, "error");
      }
    }
  });

window.addEventListener("beforeunload", () => {
  if (pollerId) {
    clearInterval(pollerId);
  }
});

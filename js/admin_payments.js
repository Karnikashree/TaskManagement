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
    loadPayments();
    injectProjectsDropdown();
    loadAdminProjectsDropdown();
    loadMemberViewButton();
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
    const links = ["nav-dashboard", "nav-tasks", "nav-members", "nav-payments", "nav-brand"];
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


async function loadSubscriptions() {

}

async function loadPayments() {
    const tbody = document.getElementById("payments-table-body");
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading member details...</td></tr>';

    try {
        const { data: members, error: memError } = await supabase
            .from("team_members")
            .select(`
                joined_at,
                user_id,
                role
            `)
            .eq("team_id", currentTeamId);

        if (memError) throw memError;

        const { data: allSubs, error: subError } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("team_id", currentTeamId)
            .order("created_at", { ascending: false });

        if (subError) throw subError;

        const subMap = {};
        if (allSubs) {
            allSubs.forEach(s => {
                if (!subMap[s.user_id] || s.status === 'active') { 
                    if (!subMap[s.user_id]) subMap[s.user_id] = s;
                    else if (s.status === 'active') subMap[s.user_id] = s;
                }
            });
        }

        const { data: allPay, error: payError } = await supabase
            .from("payments")
            .select("paid_at, user_id")
            .eq("team_id", currentTeamId)
            .order("paid_at", { ascending: false });

        const payMap = {};
        if (allPay) {
            allPay.forEach(p => {
                if (!payMap[p.user_id]) payMap[p.user_id] = p;
            });
        }

        const userIds = members.map(m => m.user_id);
        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);

        const profileMap = {};
        if (profiles) {
            profiles.forEach(p => profileMap[p.id] = p);
        }

        tbody.innerHTML = "";

        members.forEach(m => {
            const profile = profileMap[m.user_id] || { full_name: "Unknown", email: "Unknown" };
            const joinedAt = new Date(m.joined_at).toLocaleDateString();

            const userSub = subMap[m.user_id];
            const userPay = payMap[m.user_id];

            let status = "Pending";
            let subStarted = "-";
            let dueDate = "-";
            let lastPaid = "-";

            if (m.role === 'admin') {
                status = "Active"; 
            } else if (userSub) {
                status = userSub.status || "Pending";
                subStarted = userSub.current_period_start ? new Date(userSub.current_period_start).toLocaleDateString() : "-";
                dueDate = userSub.current_period_end ? new Date(userSub.current_period_end).toLocaleDateString() : "-";
            }

            if (userPay) {
                lastPaid = new Date(userPay.paid_at).toLocaleDateString();
            }

            let labelClass = "warning"; 
            if (status.toLowerCase() === "active") labelClass = "success";
            else if (status === "created") labelClass = "info";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${profile.full_name || "N/A"} ${m.role === 'admin' ? '(Admin)' : ''}</td>
                <td>${profile.email || "N/A"}</td>
                <td>${joinedAt}</td>
                <td>${subStarted}</td>
                <td>${lastPaid}</td>
                <td>${dueDate}</td>
                <td><span class="label label-${labelClass}">${status}</span></td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Error loading details:", err);
        tbody.innerHTML = `<tr><td colspan="7" class="text-danger">Error loading data: ${err.message}</td></tr>`;
    }
}

function injectProjectsDropdown() {
    const userDropdown = document.querySelector(".user-dropdown");
    if (userDropdown) {
        const existing = userDropdown.querySelector(".project-btn-link");
        if (existing) return;

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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: memberships } = await supabase
            .from("team_members")
            .select("team_id")
            .eq("user_id", user.id)
            .eq("role", "admin");

        if (!memberships || memberships.length === 0) {
            dropdown.innerHTML = '<li><a href="#">No projects found</a></li>';
            return;
        }

        const teamIds = memberships.map((m) => m.team_id);
        const { data: teams } = await supabase
            .from("teams")
            .select("id, name")
            .in("id", teamIds)
            .order("name");

        dropdown.innerHTML = "";
        teams.forEach((team) => {
            const li = document.createElement("li");
            li.innerHTML = `<a href="admin_payments.html?teamId=${team.id}">${team.name}</a>`; // specific to this page
            dropdown.appendChild(li);
        });
    } catch (e) {
        console.error("Error loading projects dropdown:", e);
    }
}

function loadMemberViewButton() {
    const userDropdown = document.querySelector(".user-dropdown");
    if (userDropdown) {
        if (userDropdown.querySelector('.member-view-btn')) return;
        const btn = document.createElement("a");
        btn.className = 'member-view-btn';
        btn.href = "#";
        btn.onclick = (e) => {
            e.preventDefault();
            window.location.href = `team_dashboard.html?teamId=${currentTeamId}`;
        };
        btn.innerHTML = '<i class="fa fa-eye"></i> Member View';
        btn.style.cssText =
            "color: white; font-weight: 600; margin-left: 15px; text-decoration: none; border: 1px solid rgba(255,255,255,0.3); padding: 5px 10px; border-radius: 4px; cursor: pointer;";
        userDropdown.appendChild(btn);
    }
}

window.copyTeamId = function () {
    if (!currentTeamId) return;
    navigator.clipboard.writeText(currentTeamId).then(() => {
        showToast("Team ID copied!", "success");
    });
};

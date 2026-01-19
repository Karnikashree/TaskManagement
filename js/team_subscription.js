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
    loadSubscriptionDetails();
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

async function loadSubscriptionDetails() {
    try {
        const { data: memberData, error: memError } = await supabase
            .from("team_members")
            .select(`joined_at, user_id, role`)
            .eq("team_id", currentTeamId)
            .eq("user_id", currentUser.id)
            .single();

        if (memError) throw memError;

        // Query for THIS user's specific subscription
        let { data: subs, error } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("team_id", currentTeamId)
            .eq("user_id", currentUser.id) // Ensure we only check for this user's sub
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        const { data: pay } = await supabase
            .from("payments")
            .select("paid_at")
            .eq("team_id", currentTeamId)
            .eq("user_id", currentUser.id) // Check payments for this user
            .order("paid_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", currentUser.id)
            .single();

        const memName = profile?.full_name || currentUser.email.split("@")[0];
        const memEmail = profile?.email || currentUser.email;
        const joinedDate = memberData?.joined_at ? new Date(memberData.joined_at).toLocaleDateString() : "-";

        const subStarted = subs?.current_period_start ? new Date(subs.current_period_start).toLocaleDateString() : "-";
        const dueDate = subs?.current_period_end ? new Date(subs.current_period_end).toLocaleDateString() : "-";
        const lastPaid = pay?.paid_at ? new Date(pay.paid_at).toLocaleDateString() : "-";

        // If no user-specific subscription found, or checking logic, default to Pending if member
        const status = subs?.status || "Pending";

        const statusClass = (status === "active") ? "success" : (status === "created" ? "info" : "warning");

        document.getElementById("mem-name").textContent = memName;
        document.getElementById("mem-email").textContent = memEmail;
        document.getElementById("mem-joined").textContent = joinedDate;

        const statusEl = document.getElementById("current-status");
        statusEl.textContent = status;
        statusEl.className = `label label-${statusClass}`;

        document.getElementById("sub-started").textContent = subStarted;
        document.getElementById("last-paid").textContent = lastPaid;
        document.getElementById("payment-due").textContent = dueDate;

    } catch (err) {
        console.error("Error loading sub details:", err);
    }
}


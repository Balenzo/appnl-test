// =========================================================
// BAL ENZO - AUTHENTICATIE
// Supabase login / registratie / uitloggen
// =========================================================


// =========================================================
// REGISTREREN
// =========================================================

async function registerUser(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        console.error("Registratie mislukt:", error);
        return {
            success: false,
            error: error.message
        };
    }

    console.log("Registratie geslaagd:", data);

    return {
        success: true,
        user: data.user,
        session: data.session
    };
}


// =========================================================
// INLOGGEN
// =========================================================

async function loginUser(email, password) {
    const { data, error } =
        await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

    if (error) {
        console.error("Inloggen mislukt:", error);
        return {
            success: false,
            error: error.message
        };
    }

    console.log("Inloggen geslaagd:", data);

    return {
        success: true,
        user: data.user,
        session: data.session
    };
}


// =========================================================
// UITLOGGEN
// =========================================================

async function logoutUser() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error("Uitloggen mislukt:", error);
        return {
            success: false,
            error: error.message
        };
    }

    console.log("Uitloggen geslaagd");

    return {
        success: true
    };
}


// =========================================================
// HUIDIGE GEBRUIKER OPHALEN
// =========================================================

async function getCurrentUser() {
    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    if (error) {
        console.error("Gebruiker ophalen mislukt:", error);
        return null;
    }

    return user;
}


// =========================================================
// HUIDIGE SESSIE OPHALEN
// =========================================================

async function getCurrentSession() {
    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error) {
        console.error("Sessie ophalen mislukt:", error);
        return null;
    }

    return session;
}


// =========================================================
// LUISTEREN NAAR LOGIN / LOGOUT
// =========================================================

supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("Auth status gewijzigd:", event);

    if (session) {
        console.log("Ingelogd als:", session.user.email);
    } else {
        console.log("Geen actieve gebruiker");
    }
});
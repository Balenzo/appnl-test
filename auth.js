// =========================================================
// BAL ENZO - AUTHENTICATIE & MONEYGAMES
// =========================================================
// Complete Moneygames v1 frontend controller.
//
// BELANGRIJK
// - Deze file gebruikt uitsluitend de normale Supabase client.
// - NOOIT een service_role key in deze frontend plaatsen.
// - Kritieke wijzigingen gebeuren via veilige Supabase RPC's.
// - Profielen van andere spelers worden uitsluitend via
//   get_moneygame_profiles / get_my_moneygame_participants opgehaald.
// - E-mailadressen van andere spelers worden nooit weergegeven.
//
// Verwachte bestaande Supabase RPC's:
//   get_moneygame_profiles(user_ids uuid[])
//   get_my_moneygame_participants(game_ids uuid[])
//
// RPC's die door de bijbehorende SQL-stap worden toegevoegd:
//   create_moneygame
//   react_to_moneygame
//   withdraw_moneygame_reaction
//   choose_moneygame_opponent
//   cancel_moneygame
//   submit_moneygame_result
//   confirm_moneygame_result
//   reject_moneygame_result
//   submit_moneygame_forfeit
//   update_moneygame_account
//   create_doubles_reaction
//   respond_to_doubles_invitation
//   choose_doubles_opponent
//   cancel_moneygame_match
//   expire_open_moneygames
// =========================================================


// =========================================================
// TAALONDERSTEUNING
// =========================================================

function moneygameTr(key, fallback, params = {}) {
  if (typeof t !== "function") {
    return fallback;
  }

  const translated = t(key, params);
  return translated === key ? fallback : translated;
}

function moneygameLocale() {
  return typeof getLocale === "function"
    ? getLocale()
    : "nl-BE";
}

// =========================================================
// CONFIGURATIE
// =========================================================

const MONEYGAME_DISCIPLINES = ["8-ball", "9-ball", "10-ball"];

const MONEYGAME_STATUSES = {
  OPEN: "open",
  PENDING_PARTNER: "pending_partner",
  MATCHED: "matched",
  RESULT_PENDING: "result_pending",
  PLAYED: "played",
  FINISHED: "finished",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  NO_RESULT: "no_result"
};

const MONEYGAME_RESULT_STATUSES = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  REJECTED: "rejected"
};

const MONEYGAME_REACTION_STATUSES = {
  ACTIVE: "active",
  SELECTED: "selected",
  NOT_SELECTED: "not_selected",
  WITHDRAWN: "withdrawn"
};

const MONEYGAME_PARTNER_STATUSES = {
  NONE: "none",
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn"
};

const MONEYGAME_RESULT_WINDOW_HOURS = 48;

let currentMoneygamesFilter = "all";


// =========================================================
// ALGEMENE HULPFUNCTIES
// =========================================================

function moneygameEl(id) {
  return document.getElementById(id);
}

function setMoneygameMessage(id, text, type = "") {
  const el = moneygameEl(id);
  if (!el) return;

  el.textContent = text || "";
  el.classList.remove("success", "error", "warning");

  if (type) {
    el.classList.add(type);
  }
}

function escapeMoneygameHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeMoneygameAttribute(value) {
  return escapeMoneygameHtml(value);
}

function formatMoneygameName(profile) {
  if (!profile) return moneygameTr("moneygames.unknownPlayer", "Onbekende speler");

  const fullName =
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim();

  return fullName || moneygameTr("moneygames.unknownPlayer", "Onbekende speler");
}

function formatMoneygameDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: moneygameTr("common.unknownDate", "Onbekende datum"),
      time: moneygameTr("common.unknownTime", "Onbekend uur"),
      full: moneygameTr("common.unknownMoment", "Onbekend moment")
    };
  }

  const formattedDate = date.toLocaleDateString(moneygameLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const formattedTime = date.toLocaleTimeString(moneygameLocale(), {
    hour: "2-digit",
    minute: "2-digit"
  });

  return {
    date: formattedDate,
    time: formattedTime,
    full: `${formattedDate} · ${formattedTime}`
  };
}

function formatMoneygameStake(amount) {
  const value = Number(amount || 0);

  if (value === 0) {
    return moneygameTr("moneygames.noStake", "Geen inzet");
  }

  return `€${value.toFixed(2).replace(".00", "")}`;
}

function getMoneygameDeadline(scheduledAt) {
  const date = new Date(scheduledAt);
  return new Date(
    date.getTime() +
    MONEYGAME_RESULT_WINDOW_HOURS * 60 * 60 * 1000
  );
}

function isMoneygameResultWindowOpen(scheduledAt) {
  const now = new Date();
  const start = new Date(scheduledAt);
  const deadline = getMoneygameDeadline(scheduledAt);

  return now >= start && now <= deadline;
}

function isMoneygameStartReached(scheduledAt) {
  return new Date() >= new Date(scheduledAt);
}

function isPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

function isValidMoneygameScore(scoreA, scoreB, raceTo) {
  if (
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 ||
    scoreB < 0 ||
    !isPositiveInteger(raceTo)
  ) {
    return false;
  }

  if (scoreA === scoreB) {
    return false;
  }

  return (
    (scoreA === raceTo && scoreB < raceTo) ||
    (scoreB === raceTo && scoreA < raceTo)
  );
}

function moneygameResultErrorMessage(error, fallback) {
  console.error(fallback, error);
  return error?.message || fallback;
}

async function callMoneygameRpc(functionName, params = {}) {
  try {
    const { data, error } = await supabaseClient.rpc(
      functionName,
      params
    );

    if (error) {
      console.error(`Moneygames RPC ${functionName} fout:`, error);
      return {
        success: false,
        data: null,
        error
      };
    }

    return {
      success: true,
      data,
      error: null
    };
  } catch (error) {
    console.error(`Moneygames RPC ${functionName} exception:`, error);

    return {
      success: false,
      data: null,
      error
    };
  }
}

function normalizeRpcSingle(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

function getCurrentMoneygameType() {
  return moneygameEl("moneygamesGameType")?.value || "singles";
}


// =========================================================
// BASIS AUTHENTICATIE
// =========================================================

async function registerUser(email, password, firstName, lastName) {
  const cleanEmail = String(email || "").trim();
  const cleanFirstName = String(firstName || "").trim();
  const cleanLastName = String(lastName || "").trim();

  const { data, error } = await supabaseClient.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        first_name: cleanFirstName,
        last_name: cleanLastName
      }
    }
  });

  if (error) {
    console.error("Registratie mislukt:", error);

    return {
      success: false,
      error
    };
  }

  console.log("Registratie geslaagd.");

  return {
    success: true,
    user: data.user,
    session: data.session
  };
}


async function loginUser(email, password) {
  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email: String(email || "").trim(),
      password
    });

  if (error) {
    console.error("Inloggen mislukt:", error);

    return {
      success: false,
      error: error.message
    };
  }

  return {
    success: true,
    user: data.user,
    session: data.session
  };
}


async function logoutUser() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Uitloggen mislukt:", error);

    return {
      success: false,
      error: error.message
    };
  }

  return {
    success: true
  };
}


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
// MONEYGAMES AUTH UI
// =========================================================

function showMoneygamesLogin() {
  const loginForm = moneygameEl("moneygamesLoginForm");
  const registerForm = moneygameEl("moneygamesRegisterForm");
  const loginTab = moneygameEl("moneygamesLoginTab");
  const registerTab = moneygameEl("moneygamesRegisterTab");

  if (loginForm) loginForm.style.display = "flex";
  if (registerForm) registerForm.style.display = "none";

  loginTab?.classList.add("active");
  registerTab?.classList.remove("active");

  setMoneygameMessage("moneygamesAuthMessage", "");
}


function showMoneygamesRegister() {
  const loginForm = moneygameEl("moneygamesLoginForm");
  const registerForm = moneygameEl("moneygamesRegisterForm");
  const loginTab = moneygameEl("moneygamesLoginTab");
  const registerTab = moneygameEl("moneygamesRegisterTab");

  if (loginForm) loginForm.style.display = "none";
  if (registerForm) registerForm.style.display = "flex";

  registerTab?.classList.add("active");
  loginTab?.classList.remove("active");

  setMoneygameMessage("moneygamesAuthMessage", "");
}


async function handleMoneygamesRegister() {
  const firstName =
    moneygameEl("moneygamesRegisterFirstName")?.value.trim() || "";

  const lastName =
    moneygameEl("moneygamesRegisterLastName")?.value.trim() || "";

  const email =
    moneygameEl("moneygamesRegisterEmail")?.value.trim() || "";

  const password =
    moneygameEl("moneygamesRegisterPassword")?.value || "";

  if (!firstName || !lastName || !email || !password) {
    setMoneygameMessage(
      "moneygamesAuthMessage",
      moneygameTr("moneygames.fillAllFields", "Vul alle velden in."),
      "error"
    );
    return;
  }

  if (password.length < 6) {
    setMoneygameMessage(
      "moneygamesAuthMessage",
      "Gebruik een wachtwoord van minstens 6 tekens.",
      "error"
    );
    return;
  }

  const result = await registerUser(
    email,
    password,
    firstName,
    lastName
  );

  if (!result.success) {
    setMoneygameMessage(
      "moneygamesAuthMessage",
      result.error?.message || "Registreren is niet gelukt.",
      "error"
    );
    return;
  }

  setMoneygameMessage(
    "moneygamesAuthMessage",
    moneygameTr("moneygames.accountCreatedCheckEmail", "Account aangemaakt. Controleer je e-mail om je account te bevestigen."),
    "success"
  );
}


async function handleMoneygamesLogin() {
  const email =
    moneygameEl("moneygamesLoginEmail")?.value.trim() || "";

  const password =
    moneygameEl("moneygamesLoginPassword")?.value || "";

  if (!email || !password) {
    setMoneygameMessage(
      "moneygamesAuthMessage",
      moneygameTr("moneygames.enterEmailPassword", "Vul je e-mailadres en wachtwoord in."),
      "error"
    );
    return;
  }

  const result = await loginUser(email, password);

  if (!result.success) {
    setMoneygameMessage(
      "moneygamesAuthMessage",
      result.error || "Inloggen is niet gelukt.",
      "error"
    );
    return;
  }

  setMoneygameMessage(
    "moneygamesAuthMessage",
    moneygameTr("moneygames.loggedIn", "Ingelogd."),
    "success"
  );

  await updateMoneygamesAuthUI();
}


async function updateMoneygamesAuthUI() {
  const user = await getCurrentUser();

  const authBox = moneygameEl("moneygamesAuth");
  const appBox = moneygameEl("moneygamesApp");
  const welcomeText = moneygameEl("moneygamesWelcomeText");
  const accountEmail = moneygameEl("moneygamesAccountEmail");

  if (!authBox || !appBox) return;

  if (user) {
    authBox.style.display = "none";
    appBox.style.display = "block";

    if (accountEmail) {
      accountEmail.textContent = user.email || "";
    }

    const profile = await getOwnMoneygameProfile();

    if (welcomeText) {
      if (profile) {
        welcomeText.textContent =
          moneygameTr("moneygames.welcomeName", "Welkom, {{name}}", { name: formatMoneygameName(profile) });
      } else {
        welcomeText.textContent = moneygameTr("moneygames.welcome", "Welkom!");
      }
    }

    await loadOpenMoneygames();

    if (
      moneygameEl("moneygamesMyContent")?.style.display === "block"
    ) {
      await loadMyMoneygames();
    }
  } else {
    authBox.style.display = "block";
    appBox.style.display = "none";

    clearMoneygamesPrivateViews();
  }
}


function clearMoneygamesPrivateViews() {
  const ids = [
    "moneygamesOpenList",
    "moneygamesMyOpen",
    "moneygamesMyReactions",
    "moneygamesMyPlanned",
    "moneygamesHistory"
  ];

  ids.forEach(id => {
    const el = moneygameEl(id);
    if (el) {
      el.innerHTML = `
        <div class="moneygames-empty-state">
          Log in om Moneygames te bekijken.
        </div>
      `;
    }
  });
}


// =========================================================
// EIGEN PROFIEL
// =========================================================

async function getOwnMoneygameProfile() {
  const user = await getCurrentUser();

  if (!user) return null;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Eigen profiel laden fout:", error);
    return null;
  }

  return data;
}


// =========================================================
// MONEYGAME TABS / FORMULIER
// =========================================================

function showOpenMoneygames() {
  const openContent = moneygameEl("moneygamesOpenContent");
  const myContent = moneygameEl("moneygamesMyContent");

  if (openContent) openContent.style.display = "block";
  if (myContent) myContent.style.display = "none";

  moneygameEl("moneygamesOpenTab")?.classList.add("active");
  moneygameEl("moneygamesMyTab")?.classList.remove("active");

  loadOpenMoneygames();
}


function showMyMoneygames() {
  const openContent = moneygameEl("moneygamesOpenContent");
  const myContent = moneygameEl("moneygamesMyContent");

  if (openContent) openContent.style.display = "none";
  if (myContent) myContent.style.display = "block";

  moneygameEl("moneygamesMyTab")?.classList.add("active");
  moneygameEl("moneygamesOpenTab")?.classList.remove("active");

  loadMyMoneygames();
}


function showNewMoneygameForm() {
  const form = moneygameEl("newMoneygameForm");

  if (form) {
    form.style.display = "block";
  }

  loadMoneygamePartnerOptions();
}


function hideNewMoneygameForm() {
  const form = moneygameEl("newMoneygameForm");

  if (form) {
    form.style.display = "none";
  }

  setMoneygameMessage("moneygamesFormMessage", "");
}


function selectMoneygameType(type) {
  const normalizedType =
    type === "doubles" ? "doubles" : "singles";

  const typeInput = moneygameEl("moneygamesGameType");
  const singlesBtn = moneygameEl("moneygamesSinglesBtn");
  const doublesBtn = moneygameEl("moneygamesDoublesBtn");
  const partnerField = moneygameEl("moneygamesPartnerField");

  if (typeInput) {
    typeInput.value = normalizedType;
  }

  if (normalizedType === "doubles") {
    singlesBtn?.classList.remove("active");
    doublesBtn?.classList.add("active");

    if (partnerField) {
      partnerField.style.display = "block";
    }

    loadMoneygamePartnerOptions();
  } else {
    doublesBtn?.classList.remove("active");
    singlesBtn?.classList.add("active");

    if (partnerField) {
      partnerField.style.display = "none";
    }
  }
}


function toggleMoneygamesCustomStake() {
  const stake = moneygameEl("moneygamesStake")?.value;
  const customField = moneygameEl("moneygamesCustomStakeField");

  if (!customField) return;

  customField.style.display =
    stake === "custom" ? "block" : "none";
}


function filterMoneygames(discipline, button) {
  currentMoneygamesFilter = MONEYGAME_DISCIPLINES.includes(discipline)
    ? discipline
    : "all";

  document
    .querySelectorAll(".moneygames-filter-btn")
    .forEach(btn => btn.classList.remove("active"));

  button?.classList.add("active");

  loadOpenMoneygames();
}


// =========================================================
// NIEUWE MONEYGAME PLAATSEN
// =========================================================

async function submitNewMoneygame() {
  const gameType = getCurrentMoneygameType();
  const discipline =
    moneygameEl("moneygamesDiscipline")?.value || "";

  const raceTo =
    Number(moneygameEl("moneygamesRaceTo")?.value || 0);

  const stakeChoice =
    moneygameEl("moneygamesStake")?.value || "0";

  const customStake =
    moneygameEl("moneygamesCustomStake")?.value || "";

  const date =
    moneygameEl("moneygamesDate")?.value || "";

  const time =
    moneygameEl("moneygamesTime")?.value || "";

  const partner =
    moneygameEl("moneygamesPartner")?.value || "";

  if (!MONEYGAME_DISCIPLINES.includes(discipline)) {
    setMoneygameMessage(
      "moneygamesFormMessage",
      moneygameTr("moneygames.chooseValidDiscipline", "Kies een geldige discipline."),
      "error"
    );
    return;
  }

  if (!isPositiveInteger(raceTo)) {
    setMoneygameMessage(
      "moneygamesFormMessage",
      moneygameTr("moneygames.enterValidRaceTo", "Vul een geldige Race To in."),
      "error"
    );
    return;
  }

  if (!date || !time) {
    setMoneygameMessage(
      "moneygamesFormMessage",
      moneygameTr("moneygames.chooseDateTime", "Kies een datum en starttijd."),
      "error"
    );
    return;
  }

  let stakeAmount = 0;

  if (stakeChoice === "custom") {
    stakeAmount = Number(customStake);

    if (!Number.isFinite(stakeAmount) || stakeAmount < 0) {
      setMoneygameMessage(
        "moneygamesFormMessage",
        moneygameTr("moneygames.enterValidStake", "Vul een geldig inzetbedrag in."),
        "error"
      );
      return;
    }
  } else {
    stakeAmount = Number(stakeChoice);

    if (!Number.isFinite(stakeAmount) || stakeAmount < 0) {
      setMoneygameMessage(
        "moneygamesFormMessage",
        moneygameTr("moneygames.invalidStake", "Ongeldige inzet."),
        "error"
      );
      return;
    }
  }

  const scheduledAt = new Date(
  `${date}T${time}:00`
).toISOString();

  if (new Date(scheduledAt) <= new Date()) {
    setMoneygameMessage(
      "moneygamesFormMessage",
      "De starttijd moet in de toekomst liggen.",
      "error"
    );
    return;
  }

  if (gameType === "doubles" && !partner) {
    setMoneygameMessage(
      "moneygamesFormMessage",
      moneygameTr("moneygames.choosePartnerFirst", "Kies eerst een partner."),
      "error"
    );
    return;
  }

  const user = await getCurrentUser();

  if (!user) {
    setMoneygameMessage(
      "moneygamesFormMessage",
      moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."),
      "error"
    );
    return;
  }

  setMoneygameMessage(
    "moneygamesFormMessage",
    "Moneygame plaatsen..."
  );

  const rpc = await callMoneygameRpc("create_moneygame", {
    p_game_type: gameType,
    p_discipline: discipline,
    p_race_to: raceTo,
    p_stake_amount: stakeAmount,
    p_scheduled_at: scheduledAt,
    p_partner_id: gameType === "doubles" ? partner : null
  });

  if (!rpc.success) {
    setMoneygameMessage(
      "moneygamesFormMessage",
      moneygameResultErrorMessage(
        rpc.error,
        "Moneygame plaatsen is niet gelukt."
      ),
      "error"
    );
    return;
  }

  const createdGame = normalizeRpcSingle(rpc.data);

  // Bij Singles is de oproep onmiddellijk open.
  // Bij Doubles kan de RPC de partneruitnodiging als pending
  // opslaan; de oproep wordt pas openbaar na bevestiging.
  if (gameType === "doubles") {
    setMoneygameMessage(
      "moneygamesFormMessage",
      moneygameTr("moneygames.createdPartnerMustConfirm", "Moneygame aangemaakt. Je partner moet eerst bevestigen."),
      "success"
    );
  } else {
    setMoneygameMessage(
      "moneygamesFormMessage",
      "Moneygame geplaatst.",
      "success"
    );
  }

  hideNewMoneygameForm();

  if (createdGame) {
    console.log("Moneygame aangemaakt:", createdGame);
  }

  await loadOpenMoneygames();
  await loadMyMoneygames();
}


// =========================================================
// OPEN MONEYGAMES LADEN
// =========================================================

async function loadOpenMoneygames() {
  const list = moneygameEl("moneygamesOpenList");

  if (!list) return;

  const user = await getCurrentUser();

  if (!user) {
    list.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.loginToViewOpen", "Log in om open Moneygames te bekijken.")}
      </div>
    `;
    return;
  }

  list.innerHTML = `
    <div class="moneygames-empty-state">
      Moneygames laden...
    </div>
  `;

  // Enkel openbare oproepen ophalen.
  // De backend/RLS bepaalt wat werkelijk zichtbaar is.
  const { data: games, error } = await supabaseClient
    .from("moneygames")
    .select(`
      id,
      created_by,
      game_type,
      discipline,
      race_to,
      stake_amount,
      scheduled_at,
      status,
      created_at
    `)
    .eq("status", MONEYGAME_STATUSES.OPEN)
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("Open Moneygames laden fout:", error);

    list.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.loadFailed", "Moneygames konden niet geladen worden.")}
      </div>
    `;

    return;
  }

  const filteredGames = (games || []).filter(game => {
    if (currentMoneygamesFilter === "all") return true;
    return game.discipline === currentMoneygamesFilter;
  });

  if (filteredGames.length === 0) {
    list.innerHTML = `
      <div class="moneygames-empty-state">
        ${
          currentMoneygamesFilter === "all"
            ? moneygameTr("moneygames.noOpenYet", "Nog geen open Moneygames.")
            : moneygameTr("moneygames.noOpenForDiscipline", "Geen open Moneygames voor deze discipline.")
        }
      </div>
    `;
    return;
  }

  // Veilige RPC: geen publieke e-mail/profielkolommen ophalen.
  const creatorIds = [
    ...new Set(
      filteredGames
        .map(game => game.created_by)
        .filter(Boolean)
    )
  ];

  let profileMap = {};

  if (creatorIds.length > 0) {
    const profilesRpc = await callMoneygameRpc(
      "get_moneygame_profiles",
      {
        user_ids: creatorIds
      }
    );

    if (profilesRpc.success) {
      (profilesRpc.data || []).forEach(profile => {
        profileMap[profile.id] = profile;
      });
    }
  }

  // Alleen eigen actieve reacties ophalen.
  const { data: myReactions, error: reactionsError } =
    await supabaseClient
      .from("moneygame_reactions")
      .select("moneygame_id, status, partner_id, partner_status")
      .eq("user_id", user.id)
      .in("status", ["active", "selected"]);

  if (reactionsError) {
    console.error(
      "Eigen Moneygame-reacties laden fout:",
      reactionsError
    );
  }

  const reactedGameIds = new Set(
    (myReactions || [])
      .filter(
        reaction =>
          reaction.status === "active" ||
          reaction.status === "selected"
      )
      .map(reaction => reaction.moneygame_id)
  );

  list.innerHTML = filteredGames.map(game => {
    const profile = profileMap[game.created_by];
    const playerName = formatMoneygameName(profile);
    const dateTime = formatMoneygameDateTime(game.scheduled_at);
    const stake = formatMoneygameStake(game.stake_amount);

    const isOwnGame = game.created_by === user.id;
    const hasReacted = reactedGameIds.has(game.id);

    let actionHtml = "";

    if (isOwnGame) {
      actionHtml = `
        <div class="moneygames-own-label">
          ${moneygameTr("moneygames.yourCall", "JOUW OPROEP")}
        </div>
        <button
          type="button"
          class="moneygames-cancel-open-btn"
          onclick="cancelOpenMoneygame('${escapeMoneygameAttribute(game.id)}')"
        >
          ${moneygameTr("moneygames.cancelCall", "Oproep annuleren")}
        </button>
      `;
    } else if (hasReacted) {
      actionHtml = `
        <button
          type="button"
          class="moneygames-react-btn reacted"
          disabled
        >
          ${moneygameTr("moneygames.reactionSentCheck", "✓ Reactie verstuurd")}
        </button>
        <button
          type="button"
          class="moneygames-withdraw-reaction-btn"
          onclick="withdrawMoneygameReaction('${escapeMoneygameAttribute(game.id)}')"
        >
          ${moneygameTr("moneygames.withdrawReaction", "Reactie intrekken")}
        </button>
      `;
    } else if (game.game_type === "doubles") {
      actionHtml = `
        <button
          type="button"
          class="moneygames-react-btn"
          onclick="startDoublesReaction('${escapeMoneygameAttribute(game.id)}')"
        >
          ${moneygameTr("moneygames.joinWithDuo", "Ik speel mee met duo")}
        </button>
      `;
    } else {
      actionHtml = `
        <button
          type="button"
          class="moneygames-react-btn"
          onclick="reactToMoneygame('${escapeMoneygameAttribute(game.id)}', this)"
        >
          ${moneygameTr("moneygames.join", "Ik speel mee")}
        </button>
      `;
    }

    return `
      <div
        class="moneygames-open-card"
        data-discipline="${escapeMoneygameAttribute(game.discipline)}"
      >
        <div class="moneygames-open-card-top">
          <span class="moneygames-game-type">
            ${
              game.game_type === "doubles"
                ? "DOUBLES"
                : "SINGLES"
            }
          </span>

          <span class="moneygames-discipline">
            ${escapeMoneygameHtml(game.discipline)}
          </span>
        </div>

        <div class="moneygames-player-name">
          ${escapeMoneygameHtml(playerName)}
        </div>

        <div class="moneygames-open-info">
          <strong>
            Race To ${escapeMoneygameHtml(game.race_to)}
          </strong>

          <span>
            📅 ${escapeMoneygameHtml(dateTime.full)}
          </span>

          <span>
            💶 ${escapeMoneygameHtml(stake)}
          </span>
        </div>

        ${actionHtml}
      </div>
    `;
  }).join("");
}


// =========================================================
// SINGLES REAGEREN
// =========================================================

async function reactToMoneygame(moneygameId, button) {
  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Reactie versturen...";
  }

  const rpc = await callMoneygameRpc(
    "react_to_moneygame",
    {
      p_moneygame_id: moneygameId
    }
  );

  if (!rpc.success) {
    console.error("Reactie opslaan fout:", rpc.error);

    if (button) {
      button.disabled = false;
      button.textContent = moneygameTr("moneygames.join", "Ik speel mee");
    }

    alert(
      rpc.error?.message ||
      "Reactie versturen is niet gelukt."
    );
    return;
  }

  if (button) {
    button.classList.add("reacted");
    button.textContent = moneygameTr("moneygames.reactionSentCheck", "✓ Reactie verstuurd");
  }

  await loadOpenMoneygames();
  await loadMyMoneygames();
}


// =========================================================
// REACTIE INTREKKEN
// =========================================================

async function withdrawMoneygameReaction(moneygameId) {
  const confirmed = confirm(
    "Wil je je reactie op deze Moneygame intrekken?"
  );

  if (!confirmed) return;

  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const rpc = await callMoneygameRpc(
    "withdraw_moneygame_reaction",
    {
      p_moneygame_id: moneygameId
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.withdrawReactionFailed", "Je reactie kon niet worden ingetrokken.")
    );
    return;
  }

  await loadOpenMoneygames();
  await loadMyMoneygames();
}


// =========================================================
// EIGEN MONEYGAMES
// =========================================================

async function loadMyMoneygames() {
  const user = await getCurrentUser();

  if (!user) return;

  await loadMyOpenMoneygames(user);
  await loadMyReactions(user);
  await loadMyDoublesInvitations(user);
  await loadMyPlannedMoneygames(user);
  await loadMoneygameStatistics(user);
  await loadMoneygameHistory(user);
  await loadMoneygameBadges(user);
}


// =========================================================
// MIJN OPEN OPROEPEN
// =========================================================

async function loadMyOpenMoneygames(user) {
  const container = moneygameEl("moneygamesMyOpen");

  if (!container) return;

  container.innerHTML = `
    <div class="moneygames-empty-state">
      ${moneygameTr("moneygames.loadingCalls", "Oproepen laden...")}
    </div>
  `;

  const { data: games, error } = await supabaseClient
    .from("moneygames")
    .select(`
      id,
      created_by,
      game_type,
      discipline,
      race_to,
      stake_amount,
      scheduled_at,
      status,
      created_at
    `)
    .eq("created_by", user.id)
    .eq("status", MONEYGAME_STATUSES.OPEN)
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error(
      "Eigen Moneygames laden fout:",
      error
    );

    container.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.myCallsLoadFailed", "Je oproepen konden niet geladen worden.")}
      </div>
    `;

    return;
  }

  if (!games || games.length === 0) {
    container.innerHTML = `
      <div class="moneygames-empty-state">
        Je hebt momenteel geen open oproepen.
      </div>
    `;
    return;
  }

  const gameIds = games.map(game => game.id);

  const { data: reactions, error: reactionsError } =
    await supabaseClient
      .from("moneygame_reactions")
      .select(`
        id,
        moneygame_id,
        user_id,
        status,
        partner_id,
        partner_status
      `)
      .in("moneygame_id", gameIds)
      .eq("status", MONEYGAME_REACTION_STATUSES.ACTIVE);

  if (reactionsError) {
    console.error(
      "Reacties op eigen oproepen laden fout:",
      reactionsError
    );
  }

  const reactionUsers = [
    ...new Set(
      (reactions || [])
        .map(reaction => reaction.user_id)
        .filter(Boolean)
    )
  ];

  let profileMap = {};

  if (reactionUsers.length > 0) {
    const profilesRpc = await callMoneygameRpc(
      "get_moneygame_profiles",
      {
        user_ids: reactionUsers
      }
    );

    if (profilesRpc.success) {
      (profilesRpc.data || []).forEach(profile => {
        profileMap[profile.id] = profile;
      });
    }
  }

  container.innerHTML = games.map(game => {
    const dateTime = formatMoneygameDateTime(game.scheduled_at);
    const stake = formatMoneygameStake(game.stake_amount);

    const gameReactions =
      (reactions || []).filter(
        reaction => reaction.moneygame_id === game.id
      );

    let reactionsHtml = "";

    if (gameReactions.length === 0) {
      reactionsHtml = `
        <div class="moneygames-no-reactions">
          ${moneygameTr("moneygames.noReactionsYet", "Nog geen reacties.")}
        </div>
      `;
    } else {
      reactionsHtml = `
        <div class="moneygames-reaction-title">
          ${moneygameTr("moneygames.interestedPlayers", "Geïnteresseerde spelers")}
        </div>

        <div class="moneygames-candidate-list">
          ${gameReactions.map(reaction => {
            const profile = profileMap[reaction.user_id];
            const playerName = formatMoneygameName(profile);

            if (game.game_type === "doubles") {
              return `
                <div class="moneygames-candidate">
                  <div class="moneygames-candidate-name">
                    👤 ${escapeMoneygameHtml(playerName)}
                  </div>

                  <div class="moneygames-candidate-meta">
                    ${moneygameTr("moneygames.doublesCandidate", "Kandidatuur voor Doubles")}
                  </div>

                  <button
                    type="button"
                    class="moneygames-select-opponent-btn"
                    onclick="chooseDoublesOpponent(
                      '${escapeMoneygameAttribute(game.id)}',
                      '${escapeMoneygameAttribute(reaction.id)}'
                    )"
                  >
                    Duo bekijken / kiezen
                  </button>
                </div>
              `;
            }

            return `
              <div class="moneygames-candidate">
                <div class="moneygames-candidate-name">
                  👤 ${escapeMoneygameHtml(playerName)}
                </div>

                <button
                  type="button"
                  class="moneygames-select-opponent-btn"
                  onclick="chooseMoneygameOpponent(
                    '${escapeMoneygameAttribute(game.id)}',
                    '${escapeMoneygameAttribute(reaction.id)}',
                    '${escapeMoneygameAttribute(reaction.user_id)}',
                    '${escapeMoneygameAttribute(playerName)}'
                  )"
                >
                  ${moneygameTr("moneygames.chooseOpponent", "Tegenstander kiezen")}
                </button>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    return `
      <div class="moneygames-open-card">
        <div class="moneygames-open-card-top">
          <span class="moneygames-game-type">
            ${
              game.game_type === "doubles"
                ? "DOUBLES"
                : "SINGLES"
            }
          </span>

          <span class="moneygames-discipline">
            ${escapeMoneygameHtml(game.discipline)}
          </span>
        </div>

        <div class="moneygames-open-info">
          <strong>
            Race To ${escapeMoneygameHtml(game.race_to)}
          </strong>

          <span>
            📅 ${escapeMoneygameHtml(dateTime.full)}
          </span>

          <span>
            💶 ${escapeMoneygameHtml(stake)}
          </span>
        </div>

        ${reactionsHtml}

        <button
          type="button"
          class="moneygames-cancel-open-btn"
          onclick="cancelOpenMoneygame('${escapeMoneygameAttribute(game.id)}')"
        >
          ${moneygameTr("moneygames.cancelCall", "Oproep annuleren")}
        </button>
      </div>
    `;
  }).join("");
}


// =========================================================
// TEGENSTANDER KIEZEN - SINGLES
// =========================================================

async function chooseMoneygameOpponent(
  moneygameId,
  reactionId,
  opponentUserId,
  playerName
) {
  const confirmed = confirm(
    moneygameTr("moneygames.confirmChooseOpponent", "{{name}} als tegenstander kiezen?", { name: playerName })
  );

  if (!confirmed) return;

  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  // Kritieke wijziging gebeurt atomisch in de backend.
  // Dus niet langer eerst participant toevoegen en daarna
  // verschillende losse updates uitvoeren.
  const rpc = await callMoneygameRpc(
    "choose_moneygame_opponent",
    {
      p_moneygame_id: moneygameId,
      p_reaction_id: reactionId
    }
  );

  if (!rpc.success) {
    console.error(
      "Tegenstander kiezen fout:",
      rpc.error
    );

    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.chooseOpponentFailed", "Tegenstander kiezen is niet gelukt.")
    );

    return;
  }

  alert(`Match gevonden met ${playerName}!`);

  await loadMyMoneygames();
  await loadOpenMoneygames();
}


// =========================================================
// OPEN OPROEP ANNULEREN
// =========================================================

async function cancelOpenMoneygame(moneygameId) {
  const confirmed = confirm(
    moneygameTr("moneygames.confirmCancelOpen", "Wil je deze open Moneygame annuleren?")
  );

  if (!confirmed) return;

  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const rpc = await callMoneygameRpc(
    "cancel_moneygame",
    {
      p_moneygame_id: moneygameId,
      p_cancel_open: true
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.cancelCallFailed", "De oproep kon niet worden geannuleerd.")
    );
    return;
  }

  await loadOpenMoneygames();
  await loadMyMoneygames();
}


// =========================================================
// GEPLANDE MATCH ANNULEREN
// =========================================================

async function cancelMoneygameMatch(moneygameId) {
  const confirmed = confirm(
    moneygameTr("moneygames.confirmCancelPlanned", "Wil je deze geplande Moneygame annuleren?")
  );

  if (!confirmed) return;

  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const rpc = await callMoneygameRpc(
    "cancel_moneygame_match",
    {
      p_moneygame_id: moneygameId
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.cancelPlannedFailed", "De geplande Moneygame kon niet worden geannuleerd.")
    );
    return;
  }

  await loadMyMoneygames();
  await loadOpenMoneygames();
}


// =========================================================
// MIJN REACTIES
// =========================================================

async function loadMyReactions(user) {
  const container = moneygameEl("moneygamesMyReactions");

  if (!container) return;

  container.innerHTML = `
    <div class="moneygames-empty-state">
      ${moneygameTr("moneygames.loadingReactions", "Reacties laden...")}
    </div>
  `;

  const { data: reactions, error } = await supabaseClient
    .from("moneygame_reactions")
    .select(`
      id,
      moneygame_id,
      status,
      partner_id,
      partner_status,
      created_at
    `)
    .eq("user_id", user.id)
    .in("status", [
      MONEYGAME_REACTION_STATUSES.ACTIVE,
      MONEYGAME_REACTION_STATUSES.SELECTED
    ])
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "Mijn reacties laden fout:",
      error
    );

    container.innerHTML = `
      <div class="moneygames-empty-state">
        Mijn reacties konden niet geladen worden.
      </div>
    `;

    return;
  }

  if (!reactions || reactions.length === 0) {
    container.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.noPendingReactions", "Geen reacties in afwachting.")}
      </div>
    `;
    return;
  }

  const gameIds = [
    ...new Set(
      reactions.map(reaction => reaction.moneygame_id)
    )
  ];

  const { data: games, error: gamesError } =
    await supabaseClient
      .from("moneygames")
      .select(`
        id,
        created_by,
        game_type,
        discipline,
        race_to,
        stake_amount,
        scheduled_at,
        status
      `)
      .in("id", gameIds);

  if (gamesError) {
    console.error(
      "Moneygames van reacties laden fout:",
      gamesError
    );
  }

  const gameMap = {};

  (games || []).forEach(game => {
    gameMap[game.id] = game;
  });

  container.innerHTML = reactions
    .map(reaction => {
      const game = gameMap[reaction.moneygame_id];

      if (!game) return "";

      const dateTime =
        formatMoneygameDateTime(game.scheduled_at);

      let statusText = "Reactie in afwachting.";

      if (
        reaction.status ===
        MONEYGAME_REACTION_STATUSES.SELECTED
      ) {
        statusText = moneygameTr("moneygames.youAreSelected", "✓ Je bent geselecteerd.");
      }

      if (
        reaction.partner_status ===
        MONEYGAME_PARTNER_STATUSES.PENDING
      ) {
        statusText =
          moneygameTr("moneygames.partnerConfirmationPending", "Partnerbevestiging in afwachting.");
      }

      return `
        <div class="moneygames-open-card">
          <div class="moneygames-open-card-top">
            <span class="moneygames-game-type">
              ${
                game.game_type === "doubles"
                  ? "DOUBLES"
                  : "SINGLES"
              }
            </span>

            <span class="moneygames-discipline">
              ${escapeMoneygameHtml(game.discipline)}
            </span>
          </div>

          <div class="moneygames-open-info">
            <strong>
              Race To ${escapeMoneygameHtml(game.race_to)}
            </strong>

            <span>
              📅 ${escapeMoneygameHtml(dateTime.full)}
            </span>

            <span>
              💶 ${escapeMoneygameHtml(
                formatMoneygameStake(game.stake_amount)
              )}
            </span>
          </div>

          <div class="moneygames-pending-label">
            ${escapeMoneygameHtml(statusText)}
          </div>

          ${
            reaction.status ===
            MONEYGAME_REACTION_STATUSES.ACTIVE
              ? `
                <button
                  type="button"
                  class="moneygames-withdraw-reaction-btn"
                  onclick="withdrawMoneygameReaction('${escapeMoneygameAttribute(game.id)}')"
                >
                  ${moneygameTr("moneygames.withdrawReaction", "Reactie intrekken")}
                </button>
              `
              : ""
          }
        </div>
      `;
    })
    .join("");

  if (!container.innerHTML.trim()) {
    container.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.noPendingReactions", "Geen reacties in afwachting.")}
      </div>
    `;
  }
}

async function loadMyDoublesInvitations(user) {
  const container = moneygameEl("moneygamesMyReactions");

  if (!container || !user) return;

  const { data: invitations, error } = await supabaseClient
    .from("moneygame_reactions")
    .select(`
      id,
      moneygame_id,
      user_id,
      partner_id,
      partner_status,
      status,
      created_at
    `)
    .eq("partner_id", user.id)
    .eq("partner_status", "pending")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "Doubles-uitnodigingen laden fout:",
      error
    );
    return;
  }

  if (!invitations || invitations.length === 0) {
    return;
  }

  const gameIds = [
    ...new Set(
      invitations
        .map(invitation => invitation.moneygame_id)
        .filter(Boolean)
    )
  ];

  if (gameIds.length === 0) {
    return;
  }

  const { data: games, error: gamesError } =
    await supabaseClient
      .from("moneygames")
      .select(`
        id,
        created_by,
        game_type,
        discipline,
        race_to,
        stake_amount,
        scheduled_at,
        status
      `)
      .in("id", gameIds)
      .eq("game_type", "doubles")
      .eq(
        "status",
        MONEYGAME_STATUSES.PENDING_PARTNER
      );

  if (gamesError) {
    console.error(
      "Moneygames van Doubles-uitnodigingen laden fout:",
      gamesError
    );
    return;
  }

  if (!games || games.length === 0) {
    return;
  }

  const inviterIds = [
    ...new Set(
      invitations
        .map(invitation => invitation.user_id)
        .filter(Boolean)
    )
  ];

  let profileMap = {};

  if (inviterIds.length > 0) {
    const profilesRpc = await callMoneygameRpc(
      "get_moneygame_profiles",
      {
        user_ids: inviterIds
      }
    );

    if (profilesRpc.success) {
      (profilesRpc.data || []).forEach(profile => {
        profileMap[profile.id] = profile;
      });
    }
  }

  const gameMap = {};

  games.forEach(game => {
    gameMap[game.id] = game;
  });

  const invitationHtml = invitations
    .map(invitation => {
      const game =
        gameMap[invitation.moneygame_id];

      if (!game) {
        return "";
      }

      const inviter =
        profileMap[invitation.user_id];

      const inviterName =
        formatMoneygameName(inviter);

      const dateTime =
        formatMoneygameDateTime(
          game.scheduled_at
        );

      const stake =
        formatMoneygameStake(
          game.stake_amount
        );

      return `
        <div class="moneygames-open-card">

          <div class="moneygames-open-card-top">

            <span class="moneygames-game-type">
              DOUBLES
            </span>

            <span class="moneygames-discipline">
              ${escapeMoneygameHtml(
                game.discipline
              )}
            </span>

          </div>

          <div class="moneygames-pending-label">
            ${moneygameTr("moneygames.partnerInvitation", "PARTNERUITNODIGING")}
          </div>

          <div class="moneygames-player-name">
            ${escapeMoneygameHtml(inviterName)}
            ${moneygameTr("moneygames.wantsToPlayDuo", "wil met jou als duo spelen.")}
          </div>

          <div class="moneygames-open-info">

            <strong>
              Race To
              ${escapeMoneygameHtml(
                game.race_to
              )}
            </strong>

            <span>
              📅
              ${escapeMoneygameHtml(
                dateTime.full
              )}
            </span>

            <span>
              💶
              ${escapeMoneygameHtml(stake)}
            </span>

          </div>

          <div class="moneygames-result-actions">

            <button
              type="button"
              class="moneygames-confirm-result-btn"
              onclick="respondToDoublesInvitation(
                '${escapeMoneygameAttribute(
                  invitation.id
                )}',
                true
              )"
            >
              Accepteren
            </button>

            <button
              type="button"
              class="moneygames-reject-result-btn"
              onclick="respondToDoublesInvitation(
                '${escapeMoneygameAttribute(
                  invitation.id
                )}',
                false
              )"
            >
              ${moneygameTr("common.reject", "Weigeren")}
            </button>

          </div>

        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!invitationHtml) {
    return;
  }

  const emptyState =
    container.querySelector(
      ".moneygames-empty-state"
    );

  if (emptyState) {
    emptyState.remove();
  }

  container.insertAdjacentHTML(
    "afterbegin",
    invitationHtml
  );
}

// =========================================================
// GEPLANDE MONEYGAMES
// =========================================================

async function loadMyPlannedMoneygames(user) {
  const container = moneygameEl("moneygamesMyPlanned");

  if (!container) return;

  container.innerHTML = `
    <div class="moneygames-empty-state">
      ${moneygameTr("moneygames.loadingPlanned", "Geplande Moneygames laden...")}
    </div>
  `;

  const { data: participations, error: participationsError } =
    await supabaseClient
      .from("moneygame_participants")
      .select("moneygame_id, user_id, side")
      .eq("user_id", user.id);

  if (participationsError) {
    console.error(
      "Geplande deelnames laden fout:",
      participationsError
    );

    container.innerHTML = `
      <div class="moneygames-empty-state">
        Geplande ${moneygameTr("moneygames.loadFailed", "Moneygames konden niet geladen worden.")}
      </div>
    `;

    return;
  }

  const participantGameIds = [
    ...new Set(
      (participations || []).map(
        item => item.moneygame_id
      )
    )
  ];

  if (participantGameIds.length === 0) {
    container.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.noPlanned", "Geen geplande Moneygames.")}
      </div>
    `;
    return;
  }

  const { data: plannedGames, error: plannedError } =
    await supabaseClient
      .from("moneygames")
      .select(`
        id,
        created_by,
        game_type,
        discipline,
        race_to,
        stake_amount,
        scheduled_at,
        status
      `)
      .in("id", participantGameIds)
      .in(
        "status",
        [
            MONEYGAME_STATUSES.MATCHED,
            MONEYGAME_STATUSES.RESULT_PENDING
        ]
        )
      .order("scheduled_at", { ascending: true });

  if (plannedError) {
    console.error(
      "Geplande Moneygames laden fout:",
      plannedError
    );

    container.innerHTML = `
      <div class="moneygames-empty-state">
        Geplande ${moneygameTr("moneygames.loadFailed", "Moneygames konden niet geladen worden.")}
      </div>
    `;

    return;
  }

  if (!plannedGames || plannedGames.length === 0) {
    container.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.noPlanned", "Geen geplande Moneygames.")}
      </div>
    `;
    return;
  }

  const plannedGameIds = plannedGames.map(game => game.id);

  // Bestaande veilige RPC gebruiken.
  const participantsRpc =
    await callMoneygameRpc(
      "get_my_moneygame_participants",
      {
        game_ids: plannedGameIds
      }
    );

  const plannedParticipants =
    participantsRpc.success
      ? participantsRpc.data || []
      : [];

  const resultMap = await loadLatestResultsForGames(
    plannedGameIds
  );

  const cards = plannedGames.map(game => {
    const dateTime =
      formatMoneygameDateTime(game.scheduled_at);

    const stake =
      formatMoneygameStake(game.stake_amount);

    const gameParticipants =
      plannedParticipants.filter(
        participant =>
          participant.moneygame_id === game.id
      );

    const sideA = gameParticipants
      .filter(participant => participant.side === "A")
      .map(participant =>
        `${participant.first_name || ""} ${participant.last_name || ""}`.trim()
      )
      .filter(Boolean);

    const sideB = gameParticipants
      .filter(participant => participant.side === "B")
      .map(participant =>
        `${participant.first_name || ""} ${participant.last_name || ""}`.trim()
      )
      .filter(Boolean);

    const sideAName =
      sideA.length > 0
        ? sideA.join(" & ")
        : "Onbekende speler";

    const sideBName =
      sideB.length > 0
        ? sideB.join(" & ")
        : "Onbekende speler";

    const myParticipant =
      gameParticipants.find(
        participant =>
          participant.user_id === user.id
      );

    const existingResult =
      resultMap[game.id] || null;

    const resultHtml =
      buildMoneygameResultHtml(
        game,
        gameParticipants,
        myParticipant,
        existingResult
      );

    return `
      <div class="moneygames-open-card">

        <div class="moneygames-open-card-top">
          <span class="moneygames-game-type">
            ${
              game.game_type === "doubles"
                ? "DOUBLES"
                : "SINGLES"
            }
          </span>

          <span class="moneygames-discipline">
            ${escapeMoneygameHtml(game.discipline)}
          </span>
        </div>

        <div class="moneygames-planned-label">
          ✓ MATCH GEVONDEN
        </div>

        <div class="moneygames-versus">

          <div class="moneygames-versus-player">
            ${escapeMoneygameHtml(sideAName)}
          </div>

          <div class="moneygames-versus-vs">
            VS
          </div>

          <div class="moneygames-versus-player">
            ${escapeMoneygameHtml(sideBName)}
          </div>

        </div>

        <div class="moneygames-open-info">

          <strong>
            Race To ${escapeMoneygameHtml(game.race_to)}
          </strong>

          <span>
            📅 ${escapeMoneygameHtml(dateTime.full)}
          </span>

          <span>
            💶 ${escapeMoneygameHtml(stake)}
          </span>

        </div>

        ${resultHtml}

        ${
          game.created_by === user.id
            ? `
              <button
                type="button"
                class="moneygames-cancel-match-btn"
                onclick="cancelMoneygameMatch('${escapeMoneygameAttribute(game.id)}')"
              >
                ${moneygameTr("moneygames.cancelMatch", "Match annuleren")}
              </button>
            `
            : ""
        }

      </div>
    `;
  });

  container.innerHTML = cards.join("");
}


async function loadLatestResultsForGames(gameIds) {
  if (!gameIds || gameIds.length === 0) {
    return {};
  }

  const { data, error } = await supabaseClient
    .from("moneygame_results")
    .select(`
      id,
      moneygame_id,
      submitted_by,
      result_type,
      score_a,
      score_b,
      winner_side,
      forfeit_side,
      status,
      submitted_at,
      confirmed_by,
      confirmed_at
    `)
    .in("moneygame_id", gameIds)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error(
      "Moneygame-resultaten laden fout:",
      error
    );
    return {};
  }

  const map = {};

  (data || []).forEach(result => {
    if (!map[result.moneygame_id]) {
      map[result.moneygame_id] = result;
    }
  });

  return map;
}


// =========================================================
// RESULTAAT UI
// =========================================================

function buildMoneygameResultHtml(
  game,
  gameParticipants,
  myParticipant,
  existingResult
) {
  const userId = myParticipant?.user_id || null;
  const scheduledAt = new Date(game.scheduled_at);
  const now = new Date();
  const deadline = getMoneygameDeadline(game.scheduled_at);

  if (
    existingResult &&
    existingResult.status ===
      MONEYGAME_RESULT_STATUSES.PENDING
  ) {
    const submittedByMe =
      existingResult.submitted_by === userId;

    if (submittedByMe) {
      return `
        <div class="moneygames-result-box">

          <div class="moneygames-result-status">
            Uitslag wacht op bevestiging
          </div>

          ${buildResultScoreHtml(existingResult)}

        </div>
      `;
    }

    const isSameTeam =
      isSameParticipantSide(
        gameParticipants,
        existingResult.submitted_by,
        userId
      );

    if (!isSameTeam) {
      return `
        <div class="moneygames-result-box">

          <div class="moneygames-result-status">
            ${moneygameTr("moneygames.confirmScore", "Uitslag bevestigen")}
          </div>

          ${buildResultScoreHtml(existingResult)}

          <div class="moneygames-result-actions">

            <button
              type="button"
              class="moneygames-confirm-result-btn"
              onclick="confirmMoneygameResult(
                '${escapeMoneygameAttribute(existingResult.id)}',
                '${escapeMoneygameAttribute(game.id)}'
              )"
            >
              ${moneygameTr("common.confirm", "Bevestigen")}
            </button>

            <button
              type="button"
              class="moneygames-reject-result-btn"
              onclick="rejectMoneygameResult(
                '${escapeMoneygameAttribute(existingResult.id)}',
                '${escapeMoneygameAttribute(game.id)}'
              )"
            >
              ${moneygameTr("common.reject", "Weigeren")}
            </button>

          </div>

        </div>
      `;
    }

    return `
      <div class="moneygames-result-box">
        <div class="moneygames-result-status">
          Uitslag wacht op bevestiging
        </div>

        ${buildResultScoreHtml(existingResult)}
      </div>
    `;
  }

  if (
    existingResult &&
    existingResult.status ===
      MONEYGAME_RESULT_STATUSES.CONFIRMED
  ) {
    return `
      <div class="moneygames-result-box">

        <div class="moneygames-result-status confirmed">
          ✓ Uitslag bevestigd
        </div>

        ${buildResultScoreHtml(existingResult)}

      </div>
    `;
  }

  if (existingResult) {
    // Een geweigerd resultaat mag opnieuw ingevoerd worden
    // zolang de 48-uursdeadline nog niet voorbij is.
    if (existingResult.status === "rejected") {
      if (now <= deadline) {
        return buildResultInputHtml(
          game,
          gameParticipants
        );
      }

      return `
        <div class="moneygames-result-notice">
          ${moneygameTr("moneygames.noResult", "Geen uitslag")}
        </div>
      `;
    }
  }

  if (now < scheduledAt) {
    return `
      <div class="moneygames-result-notice">
        Resultaat kan vanaf de starttijd worden ingegeven.
      </div>
    `;
  }

  if (now <= deadline) {
    return buildResultInputHtml(
      game,
      gameParticipants
    );
  }

  return `
    <div class="moneygames-result-notice">
      ${moneygameTr("moneygames.noResult", "Geen uitslag")}
    </div>
  `;
}


function buildResultScoreHtml(result) {
  if (result.result_type === "forfeit") {
    return `
      <div class="moneygames-result-score">
        ${moneygameTr("moneygames.forfeit", "FORFAIT")}
      </div>
    `;
  }

  return `
    <div class="moneygames-result-score">
      ${escapeMoneygameHtml(result.score_a)}
      -
      ${escapeMoneygameHtml(result.score_b)}
    </div>
  `;
}


function buildResultInputHtml(game, participants) {
  const sideA = participants
    .filter(participant => participant.side === "A")
    .map(participant =>
      `${participant.first_name || ""} ${participant.last_name || ""}`.trim()
    )
    .filter(Boolean);

  const sideB = participants
    .filter(participant => participant.side === "B")
    .map(participant =>
      `${participant.first_name || ""} ${participant.last_name || ""}`.trim()
    )
    .filter(Boolean);

  const sideAName =
    sideA.length > 0
      ? sideA.join(" & ")
      : "Speler A";

  const sideBName =
    sideB.length > 0
      ? sideB.join(" & ")
      : "Speler B";

  return `
    <div class="moneygames-result-box">

      <div class="moneygames-result-status">
        ${moneygameTr("moneygames.enterResult", "Resultaat ingeven")}
      </div>

      <div class="moneygames-score-inputs">

        <div>
          <span>
            ${escapeMoneygameHtml(sideAName)}
          </span>

          <input
            type="number"
            min="0"
            step="1"
            id="moneygameScoreA-${escapeMoneygameAttribute(game.id)}"
            placeholder="0"
          >
        </div>

        <strong>-</strong>

        <div>
          <span>
            ${escapeMoneygameHtml(sideBName)}
          </span>

          <input
            type="number"
            min="0"
            step="1"
            id="moneygameScoreB-${escapeMoneygameAttribute(game.id)}"
            placeholder="0"
          >
        </div>

      </div>

      <button
        type="button"
        class="moneygames-submit-result-btn"
        onclick="submitMoneygameResult(
          '${escapeMoneygameAttribute(game.id)}',
          ${Number(game.race_to)}
        )"
      >
        ${moneygameTr("moneygames.sendScore", "Uitslag versturen")}
      </button>

      <button
        type="button"
        class="moneygames-forfeit-btn"
        onclick="submitMoneygameForfeit(
          '${escapeMoneygameAttribute(game.id)}'
        )"
      >
        Forfait
      </button>

    </div>
  `;
}


function isSameParticipantSide(
  participants,
  firstUserId,
  secondUserId
) {
  if (!firstUserId || !secondUserId) return false;

  const first =
    participants.find(
      participant =>
        participant.user_id === firstUserId
    );

  const second =
    participants.find(
      participant =>
        participant.user_id === secondUserId
    );

  if (!first || !second) return false;

  return first.side === second.side;
}


// =========================================================
// RESULTAAT INDIENEN
// =========================================================

async function submitMoneygameResult(
  moneygameId,
  raceTo
) {
  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const scoreAInput =
    moneygameEl(`moneygameScoreA-${moneygameId}`);

  const scoreBInput =
    moneygameEl(`moneygameScoreB-${moneygameId}`);

  if (!scoreAInput || !scoreBInput) {
    alert("De scorevelden konden niet worden gevonden.");
    return;
  }

  const scoreA = Number(scoreAInput.value);
  const scoreB = Number(scoreBInput.value);

  if (
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 ||
    scoreB < 0
  ) {
    alert(moneygameTr("moneygames.enterValidScore", "Vul een geldige uitslag in."));
    return;
  }

  if (!isValidMoneygameScore(scoreA, scoreB, raceTo)) {
    alert(
      `Ongeldige uitslag. De winnaar moet Race To ${raceTo} bereiken.`
    );
    return;
  }

  const rpc = await callMoneygameRpc(
    "submit_moneygame_result",
    {
      p_moneygame_id: moneygameId,
      p_result_type: "score",
      p_score_a: scoreA,
      p_score_b: scoreB
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.saveResultFailed", "Resultaat opslaan is niet gelukt.")
    );
    return;
  }

  alert(
    moneygameTr("moneygames.resultSentForConfirmation", "Resultaat verstuurd ter bevestiging.")
  );

  await loadMyMoneygames();
}


// =========================================================
// ${moneygameTr("moneygames.forfeit", "FORFAIT")}
// =========================================================

async function submitMoneygameForfeit(moneygameId) {
  const confirmed = confirm(
    "Weet je zeker dat je deze Moneygame als forfait wilt registreren?"
  );

  if (!confirmed) return;

  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const sideChoice = prompt(
    "Geef de kant van de forfaitpartij in: A of B."
  );

  if (!sideChoice) return;

  const forfeitSide =
    String(sideChoice).trim().toUpperCase();

  if (!["A", "B"].includes(forfeitSide)) {
    alert(moneygameTr("moneygames.chooseAorB", "Kies A of B."));
    return;
  }

  const rpc = await callMoneygameRpc(
    "submit_moneygame_forfeit",
    {
      p_moneygame_id: moneygameId,
      p_forfeit_side: forfeitSide
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      "Forfait registreren is niet gelukt."
    );
    return;
  }

  alert(
    moneygameTr("moneygames.forfeitSentForConfirmation", "Forfait verstuurd ter bevestiging.")
  );

  await loadMyMoneygames();
}


// =========================================================
// RESULTAAT BEVESTIGEN
// =========================================================

async function confirmMoneygameResult(
  resultId,
  moneygameId
) {
  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const confirmed = confirm(
    moneygameTr("moneygames.confirmScoreCorrect", "Bevestig je dat deze uitslag correct is?")
  );

  if (!confirmed) return;

  const rpc = await callMoneygameRpc(
    "confirm_moneygame_result",
    {
      p_result_id: resultId,
      p_moneygame_id: moneygameId
    }
  );

  if (!rpc.success) {
    console.error(
      "Resultaat bevestigen fout:",
      rpc.error
    );

    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.confirmResultFailed", "Resultaat bevestigen is niet gelukt.")
    );

    return;
  }

  alert(moneygameTr("moneygames.scoreConfirmed", "Uitslag bevestigd."));

  await loadMyMoneygames();
}


// =========================================================
// RESULTAAT WEIGEREN
// =========================================================

async function rejectMoneygameResult(
  resultId,
  moneygameId
) {
  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const confirmed = confirm(
    "Weet je zeker dat je deze uitslag wilt weigeren?"
  );

  if (!confirmed) return;

  const rpc = await callMoneygameRpc(
    "reject_moneygame_result",
    {
      p_result_id: resultId,
      p_moneygame_id: moneygameId
    }
  );

  if (!rpc.success) {
    console.error(
      "Resultaat weigeren fout:",
      rpc.error
    );

    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.rejectResultFailed", "Resultaat weigeren is niet gelukt.")
    );

    return;
  }

  alert(
    moneygameTr("moneygames.scoreRejectedNewAllowed", "Uitslag geweigerd. Een nieuwe uitslag kan worden ingevoerd zolang de 48-uursdeadline nog niet verstreken is.")
  );

  await loadMyMoneygames();
}


// =========================================================
// DOUBLES - PARTNERLIJST
// =========================================================

async function loadMoneygamePartnerOptions() {
  const select = moneygameEl("moneygamesPartner");

  if (!select) return;

  const user = await getCurrentUser();

  if (!user) return;

  select.innerHTML = `
    <option value="">
      Partner laden...
    </option>
  `;

  // De volledige profiles-tabel wordt niet publiek doorzocht.
  // De SQL-stap voorziet hiervoor een veilige RPC.
  const rpc = await callMoneygameRpc(
    "get_moneygame_partner_options"
  );

  if (!rpc.success) {
    select.innerHTML = `
      <option value="">
        ${moneygameTr("moneygames.partnersLoadFailedShort", "Partners konden niet geladen worden")}
      </option>
    `;
    return;
  }

  const partners = rpc.data || [];

  select.innerHTML = `
    <option value="">
      ${moneygameTr("moneygames.choosePartner", "Kies je partner")}
    </option>
    ${
      partners.map(partner => `
        <option value="${escapeMoneygameAttribute(partner.id)}">
          ${escapeMoneygameHtml(formatMoneygameName(partner))}
        </option>
      `).join("")
    }
  `;
}


// =========================================================
// DOUBLES - REACTIE STARTEN
// =========================================================

async function startDoublesReaction(moneygameId) {
  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  await showDoublesReactionDialog(moneygameId);
}


async function showDoublesReactionDialog(moneygameId) {
  const partners = await getAvailableMoneygamePartners();

  if (!partners) return;

  if (partners.length === 0) {
    alert(
      moneygameTr("moneygames.noPartnerAvailable", "Je hebt momenteel geen andere geregistreerde partner beschikbaar.")
    );
    return;
  }

  const names = partners
    .map(
      (partner, index) =>
        `${index + 1}. ${formatMoneygameName(partner)}`
    )
    .join("\n");

  const answer = prompt(
    `${moneygameTr("moneygames.choosePartner", "Kies je partner")} door het nummer in te geven:\n\n${names}`
  );

  if (!answer) return;

  const index = Number(answer) - 1;

  if (!Number.isInteger(index) || !partners[index]) {
    alert(moneygameTr("moneygames.invalidPartnerChoice", "Ongeldige partnerkeuze."));
    return;
  }

  const partner = partners[index];

  const confirmed = confirm(
    moneygameTr("moneygames.confirmInvitePartner", "Wil je {{name}} uitnodigen als partner?", { name: formatMoneygameName(partner) })
  );

  if (!confirmed) return;

  const rpc = await callMoneygameRpc(
    "create_doubles_reaction",
    {
      p_moneygame_id: moneygameId,
      p_partner_id: partner.id
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      "Kandidaat-duo kon niet worden aangemaakt."
    );
    return;
  }

  alert(
    moneygameTr("moneygames.partnerInvitationSent", "Je partner heeft een uitnodiging ontvangen. Het duo wordt pas zichtbaar voor de organisator nadat de partner bevestigt.")
  );

  await loadOpenMoneygames();
  await loadMyMoneygames();
}


async function getAvailableMoneygamePartners() {
  const rpc = await callMoneygameRpc(
    "get_moneygame_partner_options"
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.partnersLoadFailed", "Partners konden niet geladen worden.")
    );
    return null;
  }

  return rpc.data || [];
}


// =========================================================
// DOUBLES - ${moneygameTr("moneygames.partnerInvitation", "PARTNERUITNODIGING")} BEANTWOORDEN
// =========================================================

async function respondToDoublesInvitation(
  reactionId,
  accept
) {
  const confirmed = confirm(
    accept
      ? "Wil je deze Doubles-uitnodiging accepteren?"
      : "Wil je deze Doubles-uitnodiging weigeren?"
  );

  if (!confirmed) return;

  const rpc = await callMoneygameRpc(
    "respond_to_doubles_invitation",
    {
      p_reaction_id: reactionId,
      p_accept: Boolean(accept)
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      moneygameTr("moneygames.partnerInvitationProcessFailed", "De partneruitnodiging kon niet worden verwerkt.")
    );
    return;
  }

  await loadMyMoneygames();
  await loadOpenMoneygames();
}


// =========================================================
// DOUBLES - DUO KIEZEN
// =========================================================

async function chooseDoublesOpponent(
  moneygameId,
  reactionId
) {
  const confirmed = confirm(
    moneygameTr("moneygames.confirmChooseDuo", "Wil je dit bevestigde kandidaat-duo als tegenstander kiezen?")
  );

  if (!confirmed) return;

  const rpc = await callMoneygameRpc(
    "choose_doubles_opponent",
    {
      p_moneygame_id: moneygameId,
      p_reaction_id: reactionId
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      "Het kandidaat-duo kon niet worden gekozen."
    );
    return;
  }

  alert("Duo gekozen. De Moneygame is gepland.");

  await loadMyMoneygames();
  await loadOpenMoneygames();
}


// =========================================================
// DOUBLES - KANDIDAATREACTIE INTREKKEN
// =========================================================

async function withdrawDoublesReaction(reactionId) {
  const confirmed = confirm(
    "Wil je het kandidaat-duo intrekken?"
  );

  if (!confirmed) return;

  const rpc = await callMoneygameRpc(
    "withdraw_doubles_reaction",
    {
      p_reaction_id: reactionId
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      "Het kandidaat-duo kon niet worden ingetrokken."
    );
    return;
  }

  await loadMyMoneygames();
  await loadOpenMoneygames();
}


// =========================================================
// ACCOUNTINSTELLINGEN
// =========================================================

function toggleMoneygamesAccount() {
  const panel = moneygameEl("moneygamesAccountPanel");

  if (!panel) return;

  panel.style.display =
    panel.style.display === "none" ||
    !panel.style.display
      ? "block"
      : "none";

  populateMoneygameAccountFields();
}


async function populateMoneygameAccountFields() {
  const user = await getCurrentUser();

  if (!user) return;

  const profile = await getOwnMoneygameProfile();

  const emailInput =
    moneygameEl("moneygamesAccountEmailInput");

  const firstNameInput =
    moneygameEl("moneygamesAccountFirstName");

  const lastNameInput =
    moneygameEl("moneygamesAccountLastName");

  if (emailInput) {
    emailInput.value = user.email || "";
  }

  if (firstNameInput) {
    firstNameInput.value =
      profile?.first_name || "";
  }

  if (lastNameInput) {
    lastNameInput.value =
      profile?.last_name || "";
  }
}


async function updateMoneygamesAccount() {
  const user = await getCurrentUser();

  if (!user) {
    alert(moneygameTr("moneygames.notLoggedIn", "Je bent niet ingelogd."));
    return;
  }

  const firstName =
    moneygameEl("moneygamesAccountFirstName")?.value.trim() || "";

  const lastName =
    moneygameEl("moneygamesAccountLastName")?.value.trim() || "";

  const email =
    moneygameEl("moneygamesAccountEmailInput")?.value.trim() || "";

  if (!firstName || !lastName || !email) {
    alert("Voornaam, achternaam en e-mail zijn verplicht.");
    return;
  }

  const rpc = await callMoneygameRpc(
    "update_moneygame_account",
    {
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email
    }
  );

  if (!rpc.success) {
    alert(
      rpc.error?.message ||
      "Account aanpassen is niet gelukt."
    );
    return;
  }

  alert(
    "Accountgegevens opgeslagen."
  );

  await updateMoneygamesAuthUI();
}


async function changeMoneygamesPassword() {
  const password =
    moneygameEl("moneygamesNewPassword")?.value || "";

  if (password.length < 6) {
    alert(
      "Gebruik een wachtwoord van minstens 6 tekens."
    );
    return;
  }

  const { error } =
    await supabaseClient.auth.updateUser({
      password
    });

  if (error) {
    console.error(
      "Wachtwoord wijzigen fout:",
      error
    );

    alert(
      error.message ||
      "Wachtwoord wijzigen is niet gelukt."
    );
    return;
  }

  alert("Wachtwoord gewijzigd.");

  const input =
    moneygameEl("moneygamesNewPassword");

  if (input) {
    input.value = "";
  }
}


// =========================================================
// WACHTWOORD VERGETEN
// =========================================================

async function handleMoneygamesForgotPassword() {
  const emailInput =
    moneygameEl("moneygamesLoginEmail");

  const email =
    emailInput?.value.trim() || "";

  if (!email) {
    alert(
      moneygameTr("moneygames.enterEmailFirst", "Vul eerst je e-mailadres in.")
    );
    return;
  }

  const redirectUrl =
    `${window.location.origin}${window.location.pathname}`;

  const { error } =
    await supabaseClient.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: redirectUrl
      }
    );

  if (error) {
    console.error(
      "Wachtwoord reset aanvragen fout:",
      error
    );

    alert(
      error.message ||
      "De wachtwoordreset kon niet worden aangevraagd."
    );
    return;
  }

  alert(
    "Als dit e-mailadres geregistreerd is, ontvang je een e-mail om je wachtwoord te resetten."
  );
}


async function handleMoneygamesPasswordResetFromSession() {
  const session = await getCurrentSession();

  if (!session) return;

  // Indien later een resetformulier wordt toegevoegd,
  // wordt dit automatisch gebruikt.
  const resetPanel =
    moneygameEl("moneygamesPasswordResetPanel");

  if (!resetPanel) return;

  resetPanel.style.display = "block";
}


// =========================================================
// UITLOGGEN
// =========================================================

async function handleMoneygamesLogout() {
  const result = await logoutUser();

  if (!result.success) {
    alert(
      result.error ||
      "Uitloggen is niet gelukt."
    );
    return;
  }

  const panel =
    moneygameEl("moneygamesAccountPanel");

  if (panel) {
    panel.style.display = "none";
  }

  await updateMoneygamesAuthUI();
}


// =========================================================
// STATISTIEKEN
// =========================================================
// Geen aparte stats-tabel.
// De RPC berekent statistieken uitsluitend uit bevestigde
// resultaten. Geannuleerd/verlopen/geen uitslag tellen niet mee.
//
// Verwachte RPC:
//   get_my_moneygame_statistics()
//
// Verwacht resultaat:
// {
//   total:   { played, won, lost, winrate, balance },
//   singles: { played, won, lost, winrate, balance },
//   doubles: { played, won, lost, winrate, balance }
// }

async function loadMoneygameStatistics(user) {
  const rpc = await callMoneygameRpc(
    "get_my_moneygame_statistics"
  );

  if (!rpc.success) {
    console.error(
      "Moneygame-statistieken laden fout:",
      rpc.error
    );
    return;
  }

  const stats = normalizeRpcSingle(rpc.data);

  if (!stats) return;

  setMoneygameStat(
    "moneygamesStatPlayed",
    stats.total?.played ?? 0
  );

  setMoneygameStat(
    "moneygamesStatWon",
    stats.total?.won ?? 0
  );

  setMoneygameStat(
    "moneygamesStatLost",
    stats.total?.lost ?? 0
  );

  setMoneygameStat(
    "moneygamesStatWinrate",
    formatWinrate(stats.total?.winrate)
  );

  setMoneygameStat(
    "moneygamesStatBalance",
    formatMoneygameBalance(stats.total?.balance)
  );

  setMoneygameStat(
    "moneygamesSinglesPlayed",
    stats.singles?.played ?? 0
  );

  setMoneygameStat(
    "moneygamesSinglesWon",
    stats.singles?.won ?? 0
  );

  setMoneygameStat(
    "moneygamesSinglesLost",
    stats.singles?.lost ?? 0
  );

  setMoneygameStat(
    "moneygamesSinglesWinrate",
    formatWinrate(stats.singles?.winrate)
  );

  setMoneygameStat(
    "moneygamesSinglesBalance",
    formatMoneygameBalance(stats.singles?.balance)
  );

  setMoneygameStat(
    "moneygamesDoublesPlayed",
    stats.doubles?.played ?? 0
  );

  setMoneygameStat(
    "moneygamesDoublesWon",
    stats.doubles?.won ?? 0
  );

  setMoneygameStat(
    "moneygamesDoublesLost",
    stats.doubles?.lost ?? 0
  );

  setMoneygameStat(
    "moneygamesDoublesWinrate",
    formatWinrate(stats.doubles?.winrate)
  );

  setMoneygameStat(
    "moneygamesDoublesBalance",
    formatMoneygameBalance(stats.doubles?.balance)
  );
}


function setMoneygameStat(id, value) {
  const el = moneygameEl(id);

  if (el) {
    el.textContent = value;
  }
}


function formatWinrate(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "0%";
  }

  return `${number.toFixed(1).replace(".0", "")}%`;
}


function formatMoneygameBalance(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return "€0";
  }

  const prefix = number > 0 ? "+" : "";

  return `${prefix}€${number
    .toFixed(2)
    .replace(".00", "")}`;
}


// =========================================================
// HISTORIEK
// =========================================================
// Historiek bevat relevante Moneygames.
// Geannuleerd/verlopen/geen uitslag mogen worden getoond,
// maar tellen nooit mee voor statistieken.
//
// Verwachte RPC:
//   get_my_moneygame_history()

async function loadMoneygameHistory(user) {
  const container =
    moneygameEl("moneygamesHistory");

  if (!container) return;

  container.innerHTML = `
    <div class="moneygames-empty-state">
      ${moneygameTr("moneygames.loadingHistory", "Historiek laden...")}
    </div>
  `;

  const rpc = await callMoneygameRpc(
    "get_my_moneygame_history"
  );

  if (!rpc.success) {
    console.error(
      "Moneygame-historiek laden fout:",
      rpc.error
    );

    container.innerHTML = `
      <div class="moneygames-empty-state">
        Historiek kon niet geladen worden.
      </div>
    `;

    return;
  }

  const history = rpc.data || [];

  if (history.length === 0) {
    container.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.noHistoryYet", "Nog geen Moneygames in je historiek.")}
      </div>
    `;
    return;
  }

  container.innerHTML = history
    .map(item => buildMoneygameHistoryCard(item))
    .join("");
}


function buildMoneygameHistoryCard(item) {
  const dateTime =
    formatMoneygameDateTime(item.scheduled_at);

  const statusLabel =
    formatMoneygameHistoryStatus(item.status);

  const result =
    item.result_type === "forfeit"
      ? "Forfait"
      : item.score_a !== null &&
        item.score_b !== null
        ? `${item.score_a} - ${item.score_b}`
        : moneygameTr("moneygames.noResult", "Geen uitslag");

  return `
    <div class="moneygames-history-card">

      <div class="moneygames-open-card-top">
        <span class="moneygames-game-type">
          ${
            item.game_type === "doubles"
              ? "DOUBLES"
              : "SINGLES"
          }
        </span>

        <span class="moneygames-discipline">
          ${escapeMoneygameHtml(item.discipline || "")}
        </span>
      </div>

      <div class="moneygames-history-status">
        ${escapeMoneygameHtml(statusLabel)}
      </div>

      <div class="moneygames-open-info">

        <span>
          📅 ${escapeMoneygameHtml(dateTime.full)}
        </span>

        <span>
          Race To ${escapeMoneygameHtml(item.race_to)}
        </span>

        <span>
          💶 ${escapeMoneygameHtml(
            formatMoneygameStake(item.stake_amount)
          )}
        </span>

        <strong>
          ${escapeMoneygameHtml(result)}
        </strong>

      </div>

      ${
        item.opponent_name
          ? `
            <div class="moneygames-history-opponent">
              ${moneygameTr("moneygames.opponentLabel", "Tegenstander:")} ${escapeMoneygameHtml(
                item.opponent_name
              )}
            </div>
          `
          : ""
      }

    </div>
  `;
}


function formatMoneygameHistoryStatus(status) {
  switch (status) {
    case MONEYGAME_STATUSES.PLAYED:
      return "Gespeeld";

    case MONEYGAME_STATUSES.CANCELLED:
      return moneygameTr("moneygames.cancelled", "Geannuleerd");

    case MONEYGAME_STATUSES.EXPIRED:
      return moneygameTr("moneygames.expired", "Verlopen");

    case MONEYGAME_STATUSES.NO_RESULT:
      return moneygameTr("moneygames.noResult", "Geen uitslag");

    case MONEYGAME_STATUSES.MATCHED:
      return "Gepland";

    default:
      return status || "Onbekend";
  }
}


// =========================================================
// BADGES
// =========================================================
// Badges zijn optioneel in v1. Ze blokkeren de kernflow niet.
//
// Verwachte RPC:
//   get_my_moneygame_badges()

async function loadMoneygameBadges(user) {
  const container =
    moneygameEl("moneygamesBadges");

  if (!container) return;

  const rpc = await callMoneygameRpc(
    "get_my_moneygame_badges"
  );

  if (!rpc.success) {
    // Badge-functionaliteit is optioneel.
    container.innerHTML = "";
    return;
  }

  const badges = rpc.data || [];

  if (badges.length === 0) {
    container.innerHTML = `
      <div class="moneygames-empty-state">
        ${moneygameTr("moneygames.noBadgesYet", "Nog geen badges.")}
      </div>
    `;
    return;
  }

  container.innerHTML = badges
    .map(badge => `
      <div class="moneygames-badge-card">
        <div class="moneygames-badge-icon">
          ${escapeMoneygameHtml(badge.icon || "🏅")}
        </div>

        <div class="moneygames-badge-name">
          ${escapeMoneygameHtml(badge.name || "Badge")}
        </div>

        ${
          badge.description
            ? `
              <div class="moneygames-badge-description">
                ${escapeMoneygameHtml(
                  badge.description
                )}
              </div>
            `
            : ""
        }
      </div>
    `)
    .join("");
}


// =========================================================
// VERLOPEN OPEN OPROEPEN
// =========================================================
// De backend blijft de bron van waarheid.
// Deze functie kan bij het laden een veilige RPC aanroepen
// die open oproepen met een verstreken starttijd op verlopen zet.

async function expireOpenMoneygames() {
  const user = await getCurrentUser();

  if (!user) return;

  const rpc = await callMoneygameRpc(
    "expire_open_moneygames"
  );

  if (!rpc.success) {
    // Niet blokkeren wanneer deze onderhouds-RPC tijdelijk
    // niet beschikbaar is.
    console.warn(
      "Verlopen Moneygames konden niet automatisch verwerkt worden."
    );
    return;
  }
}


// =========================================================
// ACCOUNT / PASSWORD RESET EVENT
// =========================================================

supabaseClient.auth.onAuthStateChange(
  async (event, session) => {
    console.log(
      "Moneygames auth status gewijzigd:",
      event
    );

    if (session) {
      console.log(
        "Moneygames gebruiker ingelogd."
      );
    }

    if (event === "PASSWORD_RECOVERY") {
      await handleMoneygamesPasswordResetFromSession();
    }

    await updateMoneygamesAuthUI();
  }
);


// =========================================================
// INITIALISATIE
// =========================================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    await updateMoneygamesAuthUI();

    // Onderhoudsactie; de backend bepaalt wat werkelijk
    // gewijzigd mag worden.
    await expireOpenMoneygames();
  }
);


// =========================================================
// OPTIONAL: GLOBALE REFRESH
// =========================================================

async function refreshMoneygames() {
  const user = await getCurrentUser();

  if (!user) {
    clearMoneygamesPrivateViews();
    return;
  }

  await expireOpenMoneygames();
  await loadOpenMoneygames();
  await loadMyMoneygames();
}


// =========================================================
// EINDE AUTH.JS
// =========================================================

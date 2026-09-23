const APP_CHANGELOG_VERSION = "2.1";

let currentCompetitionData = null;
let currentCompetitionTournamentId = null;
let competitionLiveRefreshTimer = null;
let playerDetailSource = "team";
let currentMvpPercentage = null;
let playerDetailLoadId = 0;

function tr(key, fallback, params = {}) {
  if (typeof t !== "function") {
    return fallback;
  }

  const translated = t(key, params);
  return translated === key ? fallback : translated;
}

function appLocale() {
  return typeof getLocale === "function"
    ? getLocale()
    : "nl-BE";
}

let linkedProfilePlayerNameCache = null;

async function getLinkedProfilePlayerName() {
  if (linkedProfilePlayerNameCache !== null) {
    return linkedProfilePlayerNameCache;
  }

  const profileUrl = localStorage.getItem("myProfileUrl");

  if (!profileUrl) {
    linkedProfilePlayerNameCache = "";
    return "";
  }

  const cleanUrl = profileUrl.trim().replace(/\/+$/, "");
  const playerIdMatch = cleanUrl.match(/\/(\d+)$/);

  if (!playerIdMatch) {
    linkedProfilePlayerNameCache = "";
    return "";
  }

  try {
    const response = await fetch(
      `https://api.cuescore.com/participant/?id=${playerIdMatch[1]}`
    );

    if (!response.ok) {
      return "";
    }

    const player = await response.json();

    linkedProfilePlayerNameCache =
      player.name ||
      `${player.firstname || ""} ${player.lastname || ""}`.trim();

    return linkedProfilePlayerNameCache;
  } catch (error) {
    console.error("Gekoppelde CueScore-speler ophalen mislukt:", error);
    return "";
  }
}

function isLinkedProfilePlayer(playerName, linkedProfilePlayerName) {
  return Boolean(
    playerName &&
    linkedProfilePlayerName &&
    String(playerName).trim().toLowerCase() ===
      String(linkedProfilePlayerName).trim().toLowerCase()
  );
}

function getCompetitionMatchVenue(match) {
  const comment = String(match?.comment || "").trim().toUpperCase();

  const venueMap = {
    BALENZO: "Bal-enzo Billiards & Darts",
    SHOOTERS: "Shooters Tremelo",
    SPACEMONKEYS: "De Kosmonaut",
    "DOWNTOWN JACK": "DownTown Jack"
  };

  return venueMap[comment]
    || match?.playerA?.venue?.name
    || null;
}

function translateCompetitionRoundName(roundName, roundNumber = "") {
  const raw = String(roundName || "").trim();

  if (!raw) {
    return tr(
      "competition.roundNumber",
      "Ronde {{number}}",
      { number: roundNumber || "" }
    ).trim();
  }

  const normalized = raw.toLowerCase().trim();

  let match = normalized.match(/^round\s+(\d+)$/i);
  if (match) {
    return tr(
      "competition.roundNumber",
      "Ronde {{number}}",
      { number: match[1] }
    );
  }

  match = normalized.match(/^winner(?:s)?\s+round\s+(\d+)$/i);
  if (match) {
    return tr(
      "competition.winnersRoundNumber",
      "Winnaarsronde {{number}}",
      { number: match[1] }
    );
  }

  match = normalized.match(/^loser(?:s)?\s+round\s+(\d+)$/i);
  if (match) {
    return tr(
      "competition.losersRoundNumber",
      "Verliezersronde {{number}}",
      { number: match[1] }
    );
  }

  const exactNames = {
    "winners qualification": [
      "competition.winnersQualification",
      "Winnaarskwalificatie"
    ],
    "winner qualification": [
      "competition.winnersQualification",
      "Winnaarskwalificatie"
    ],
    "losers qualification": [
      "competition.losersQualification",
      "Verliezerskwalificatie"
    ],
    "loser qualification": [
      "competition.losersQualification",
      "Verliezerskwalificatie"
    ],
    "quarter final": [
      "competition.quarterFinal",
      "Kwartfinale"
    ],
    "quarter finals": [
      "competition.quarterFinal",
      "Kwartfinale"
    ],
    "semi final": [
      "competition.semiFinal",
      "Halve finale"
    ],
    "semi finals": [
      "competition.semiFinal",
      "Halve finale"
    ],
    "final": [
      "competition.final",
      "Finale"
    ],
    "third place": [
      "competition.thirdPlace",
      "Troostfinale"
    ],
    "bronze final": [
      "competition.thirdPlace",
      "Troostfinale"
    ]
  };

  const exact = exactNames[normalized];

  if (exact) {
    return tr(exact[0], exact[1]);
  }

  return raw;
}

function getNextCompetitionRound(matches) {

    if (!Array.isArray(matches) || !matches.length) {
        return null;
    }

    const now = Date.now();

    const rounds = new Map();

    matches.forEach(match => {

        const roundKey =
            match.roundName ||
            `round-${match.round ?? ""}`;

        if (!rounds.has(roundKey)) {
            rounds.set(roundKey, []);
        }

        rounds.get(roundKey).push(match);
    });

    const candidates = [];

    rounds.forEach(roundMatches => {

        const futureUnfinishedMatches =
            roundMatches.filter(match => {

                if (match.matchstatus === "finished") {
                    return false;
                }

                if (!match.starttime) {
                    return false;
                }

                const startTime =
                    new Date(match.starttime).getTime();

                return (
                    Number.isFinite(startTime) &&
                    startTime >= now
                );
            });

        if (!futureUnfinishedMatches.length) {
            return;
        }

        /*
         * Een losse inhaalwedstrijd mag een gewone
         * volgende speeldag niet overnemen.
         *
         * Daarom moet minstens de helft van de ronde
         * nog toekomstig/onafgewerkt zijn.
         */
        const minimumRemainingMatches =
            Math.ceil(roundMatches.length / 2);

        if (
            futureUnfinishedMatches.length <
            minimumRemainingMatches
        ) {
            return;
        }

        const firstStartTime =
            Math.min(
                ...futureUnfinishedMatches.map(match =>
                    new Date(match.starttime).getTime()
                )
            );

        const referenceMatch =
            futureUnfinishedMatches.find(match =>
                new Date(match.starttime).getTime() ===
                firstStartTime
            ) || futureUnfinishedMatches[0];

        candidates.push({
            round: referenceMatch.round ?? null,
            roundName: referenceMatch.roundName || "",
            starttime: referenceMatch.starttime,
            sortTime: firstStartTime,
            matches: roundMatches
        });
    });

    if (!candidates.length) {
        return null;
    }

    candidates.sort((a, b) =>
        a.sortTime - b.sortTime
    );

    return candidates[0];
}

// ===============================
// FAVORIETEN
// ===============================

function favoriteIcon(type) {

  const icons = {

    profile: `
      <svg class="favorite-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M4.5 21c.7-4.2 3.2-6.5 7.5-6.5s6.8 2.3 7.5 6.5"></path>
      </svg>
    `,

    trophy: `
      <svg class="favorite-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 4h8v5a4 4 0 0 1-8 0V4z"></path>
        <path d="M8 6H4v2a4 4 0 0 0 4 4"></path>
        <path d="M16 6h4v2a4 4 0 0 1-4 4"></path>
        <path d="M12 13v4"></path>
        <path d="M8 21h8"></path>
        <path d="M9 17h6v4H9z"></path>
      </svg>
    `,

    pool: `
      <svg class="favorite-icon-svg favorite-icon-ball" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <circle cx="12" cy="9" r="3.2"></circle>
        <text x="12" y="10.4" text-anchor="middle">8</text>
      </svg>
    `,

    live: `
      <svg class="favorite-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="13" rx="2"></rect>
        <path d="M8 22h8"></path>
        <path d="M12 18v4"></path>
        <path d="M10 9l5 2.5-5 2.5z"></path>
      </svg>
    `,

    table: `
      <svg class="favorite-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="18" height="11" rx="2"></rect>
        <circle cx="7" cy="10" r="1"></circle>
        <circle cx="17" cy="13" r="1"></circle>
        <path d="M6 17v3"></path>
        <path d="M18 17v3"></path>
      </svg>
    `

  };

  return icons[type] || icons.pool;
}

const favoriteOptions = {
  myProfile: {
    icon: favoriteIcon('profile'),
    title: tr('favorites.myProfile', 'Mijn profiel'),
    url: null
  },
  'club-live': {
    icon: favoriteIcon('live'),
    title: 'Live Scores',
    url: 'https://cuescore.com/venue/table/jumbotron/?venueId=1280972&branchId=1'
  },
  'club-reservation': {
    icon: favoriteIcon('table'),
    title: tr('favorites.reserveTable', 'Tafel reserveren'),
    url: 'https://www.bal-enzo.be/reservaties/'
  },
  'club-page': {
    icon: favoriteIcon('pool'),
    title: tr('favorites.clubPage', 'Clubpagina'),
    url: 'https://cuescore.com/bal-enzobilliardsdarts'
  },
  'competition-first': {
    icon: favoriteIcon('trophy'),
    title: tr('competition.firstDivision', 'Eerste Klasse'),
    url: null,
    action: () => openCompetitionDetail("74130085")
},

'competition-second': {
    icon: favoriteIcon('trophy'),
    title: tr('competition.secondDivision', 'Tweede Klasse'),
    url: null,
    action: () => openCompetitionDetail("74130109")
},

'competition-third': {
    icon: favoriteIcon('trophy'),
    title: tr('competition.thirdDivision', 'Derde Klasse'),
    url: null,
    action: () => openCompetitionDetail("74130127")
},

'competition-cup': {
    icon: favoriteIcon('trophy'),
    title: tr('competition.cup', 'Beker'),
    url: null,
    action: () => openCompetitionDetail("74130139")
},

// START COMPETITIE NL FAVORIET - VERWIJDEREN IN APP
'competition-nl': {
    icon: '<span class="favorite-country-label">NL</span>',
    title: tr('competition.netherlands', 'Competitie NL'),
    url: null,
    action: () => openCompetitionDetail("83574892")
},
// EINDE COMPETITIE NL FAVORIET - VERWIJDEREN IN APP

'breakplay-1': {
    icon: '<img src="breakplayicon.png" alt="" class="favorite-breakplay-logo">',
    title: tr('competition.breakPlay1', 'Break & Play Reeks 1'),
    url: null,
    action: () => openCompetitionDetail("85928236")
},

'breakplay-2': {
    icon: '<img src="breakplayicon.png" alt="" class="favorite-breakplay-logo">',
    title: tr('competition.breakPlay2', 'Break & Play Reeks 2'),
    url: null,
    action: () => openCompetitionDetail("85928569")
},

'breakplay-3': {
    icon: '<img src="breakplayicon.png" alt="" class="favorite-breakplay-logo">',
    title: tr('competition.breakPlay3', 'Break & Play Reeks 3'),
    url: null,
    action: () => openCompetitionDetail("85928635")
},

'breakplay-4': {
    icon: '<img src="breakplayicon.png" alt="" class="favorite-breakplay-logo">',
    title: tr('competition.breakPlay4', 'Break & Play Reeks 4'),
    url: null,
    action: () => openCompetitionDetail("85928797")
},

'breakplay-5': {
    icon: '<img src="breakplayicon.png" alt="" class="favorite-breakplay-logo">',
    title: tr('competition.breakPlay5', 'Break & Play Reeks 5'),
    url: null,
    action: () => openCompetitionDetail("85929085")
},
  facebook: {
    icon: `
      <svg class="favorite-social-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 8h3V4h-3c-3 0-5 2-5 5v3H6v4h3v6h4v-6h3l1-4h-4V9c0-.7.3-1 1-1z"></path>
      </svg>
    `,
    title: 'Facebook',
    url: 'https://www.facebook.com/billiardsendarts'
},
instagram: {
    icon: `
      <svg class="favorite-social-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5"></rect>
        <circle cx="12" cy="12" r="4"></circle>
        <circle cx="17.5" cy="6.5" r="1"></circle>
      </svg>
    `,
    title: 'Instagram',
    url: 'https://www.instagram.com/balenzo_billiards_darts/'
},
 start2pool: {
  icon: '<img src="start2pool.png" alt="" class="favorite-start2pool-logo">',
  title: 'Start2Pool',
  url: '#'
}

};

// Favorieten laden
let favorites = JSON.parse(localStorage.getItem('favorites'));
if (!favorites || !Array.isArray(favorites) || favorites.length === 0) {
  favorites = ['myProfile'];
  localStorage.setItem('favorites', JSON.stringify(favorites));
}

// ===============================
// FAVORIETEN RENDEREN
// ===============================

function renderFavorites() {
  const container = document.querySelector('.favorites-row');
  if (!container) return;

  // Lijst leegmaken
  container.innerHTML = '';

  // Alle geselecteerde favorieten tonen
  favorites.forEach(id => {
    const item = favoriteOptions[id];
    if (!item) return;

    let card;

    // 👤 Mijn profiel: maak een echte link met de opgeslagen profiel-URL
    if (id === 'myProfile') {
      const profileUrl = localStorage.getItem('myProfileUrl');

      if (profileUrl && profileUrl.trim() !== '') {
        card = document.createElement('button');
        card.type = 'button';
        card.className = 'favorite-card';
        card.style.border = 'none';
        card.style.cursor = 'pointer';

        card.addEventListener('click', function () {
            openMyProfile();
        });
        } 
        else {
        // Nog geen profiel ingesteld
        card = document.createElement('button');
        card.type = 'button';
        card.className = 'favorite-card';
        card.style.border = 'none';
        card.style.cursor = 'pointer';
        card.style.background = 'linear-gradient(180deg, #1a1a1a, #111)';
        card.style.color = '#fff';

        card.addEventListener('click', function () {
          openProfile();
        });
      }
    }

else if (item.action) {
    card = document.createElement('button');
    card.type = 'button';
    card.className = 'favorite-card';
    card.style.border = 'none';
    card.style.cursor = 'pointer';

    card.addEventListener('click', function () {
        item.action();
    });
}

    // 🔗 Gewone externe links
    else if (item.url && item.url !== '#') {
      card = document.createElement('a');
      card.className = 'favorite-card';
      card.href = item.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
    }

    // 📦 Niet-klikbare items
    else {
      card = document.createElement('div');
      card.className = 'favorite-card';
    }

    // Inhoud van de kaart
    card.innerHTML = `
      <div class="favorite-icon">${item.icon}</div>
      <div class="favorite-title">${item.title}</div>
    `;

    // Toevoegen aan de lijst
    container.appendChild(card);
  });
}
// ===============================
// FAVORIETEN MODAL
// ===============================

function openFavoritesEditor() {
  const modal = document.getElementById('favoritesModal');
  const container = document.getElementById('favoritesOptions');

  if (!modal || !container) return;

  container.innerHTML = '';

  Object.entries(favoriteOptions).forEach(([id, item]) => {
    const row = document.createElement('label');
    row.className = 'favorite-option';

    row.innerHTML = `
      <input type="checkbox"
             value="${id}"
             ${favorites.includes(id) ? 'checked' : ''}>
      <span class="favorite-option-content">
    <span class="favorite-option-icon">${item.icon}</span>
    <span class="favorite-option-title">${item.title}</span>
</span>
    `;

    container.appendChild(row);
  });

  modal.classList.add('show');
}

function closeFavoritesEditor() {
  const modal = document.getElementById('favoritesModal');

  if (modal) {
    modal.classList.remove('show');
  }
}

function saveFavoritesSelection() {
  const checked = document.querySelectorAll(
    '#favoritesOptions input[type="checkbox"]:checked'
  );

  favorites = Array.from(checked).map(input => input.value);

  if (favorites.length === 0) {
    favorites = ['myProfile'];
  }

  localStorage.setItem('favorites', JSON.stringify(favorites));

  renderFavorites();
  closeFavoritesEditor();
}

// ===============================
// PROFIEL
// ===============================

function setProfile() {
  const url = prompt(tr('profile.enterCueScoreUrl', 'Voer de link van je CueScore-profiel in:'));
  if (!url) return;

  localStorage.setItem('myProfileUrl', url);
  alert(tr('profile.saved', 'Profiel opgeslagen.'));
}

function openProfile() {
  const url = localStorage.getItem('myProfileUrl');

  if (!url || !url.trim()) {
    alert(tr('profile.notSet', 'Je hebt nog geen profiel ingesteld.'));
    return;
  }

  openMyProfile();
}

function showChangelogIfNeeded() {
  const lastSeenVersion =
    localStorage.getItem(
      "appChangelogVersion"
    );

  if (
    lastSeenVersion ===
    APP_CHANGELOG_VERSION
  ) {
    return;
  }

  alert(
    "🎉 Wat is er nieuw?\n\n" +
    "• 👤 Profiel zichtbaar in app met alle info\n" +
    "• 🎱 Tornooien zichtbaar in app\n" +
    "• 🔔 Volledig nieuwe lay-out\n" +
    "• 🔎 Spelers zoeken op CueScore en uitgebreide spelersprofielen bekijken\n" +
    "• 🏆 Tornooien uitgebreid met standen, podium, spelers en wedstrijden\n" +
    "• ⚡ Diverse verbeteringen in snelheid, navigatie en gebruiksgemak"
);

  localStorage.setItem(
    "appChangelogVersion",
    APP_CHANGELOG_VERSION
  );
}

document.addEventListener('DOMContentLoaded', function () {
  // Favorieten tonen
  renderFavorites();
  showChangelogIfNeeded();  

  // Bottom navigation
  const screens = document.querySelectorAll('.screen');
  const navButtons = document.querySelectorAll('.nav-item');

  function showScreen(screenId) {

    /*
     * Stop de automatische competitie-refresh
     * zodra we het competitie-detailscherm verlaten.
     */
    if (
        screenId !== "competitionDetailScreen" &&
        competitionLiveRefreshTimer
    ) {
        clearInterval(competitionLiveRefreshTimer);
        competitionLiveRefreshTimer = null;
        currentCompetitionTournamentId = null;
    }

    screens.forEach(screen => {
        screen.classList.remove("active");
    });

    const selected = document.getElementById(screenId);

    if (selected) {
        selected.classList.add("active");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
}

  navButtons.forEach(button => {
    button.addEventListener('click', function () {
      navButtons.forEach(btn => btn.classList.remove('active'));
      this.classList.add('active');

      const target = this.getAttribute('data-target');

      if (target) {
        showScreen(target);
      }
    });
  });

  // Competitie tabs
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {

      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });

      const target = document.getElementById(
        'tab-' + this.dataset.tab
      );

      if (target) {
        target.classList.add('active');
      }
    });
  });

  // Service Worker
  if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(registration => {
      console.log('Service Worker geregistreerd');

      // Controleer onmiddellijk op updates
      registration.update();

      // Als er al een nieuwe versie klaarstaat
      if (registration.waiting) {
        if (confirm(tr('app.updateAvailable', 'Er is een nieuwe versie van de app beschikbaar. Wil je nu vernieuwen?'))) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        }
      }

      // Luister naar nieuwe updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            if (confirm(tr('app.updateAvailable', 'Er is een nieuwe versie van de app beschikbaar. Wil je nu vernieuwen?'))) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }
          }
        });
      });
    })
    .catch(err => console.log('Service Worker fout:', err));

  // Herladen zodra de nieuwe service worker actief wordt
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

});

/* ===========================
   OPEN COMPETITION DETAIL
=========================== */

async function openProfilePlayedMatch(matchId, tournamentId) {

  if (!matchId || !tournamentId) {
    return;
  }

  sessionStorage.setItem(
    "competitionDetailSource",
    "profileMatches"
  );

  sessionStorage.setItem(
    "profileMatchReturnTab",
    "played"
  );

  await openCompetitionDetail(
    Number(tournamentId),
    "profileMatches"
  );

  openMatchDetail(
    Number(matchId),
    Number(tournamentId)
  );
}

function openProfileTournament(tournamentId) {
  sessionStorage.setItem(
    "competitionDetailSource",
    "profileTournaments"
  );

  openCompetitionDetail(
    tournamentId,
    "profileTournaments"
  );
}

async function openTournamentRanking(tournamentId) {

    const rankingScreen =
        document.getElementById("tournamentRankingScreen");

    const rankingLoading =
        document.getElementById("tournamentRankingLoading");

    const rankingContent =
        document.getElementById("tournamentRankingContent");

    const rankingTitle =
        document.getElementById("tournamentRankingTitle");

    if (
        !rankingScreen ||
        !rankingLoading ||
        !rankingContent
    ) {
        return;
    }

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    rankingScreen.classList.add("active");

    if (rankingTitle) {
        rankingTitle.textContent = "Ranking";
    }

    rankingLoading.style.display = "block";
    rankingLoading.textContent = "Ranking laden...";

    rankingContent.style.display = "none";
    rankingContent.innerHTML = "";

    try {

    const response = await fetch(
        `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=tournamentRanking&tournamentId=${tournamentId}`
    );

    if (!response.ok) {
        throw new Error(
            `Ranking kon niet geladen worden (${response.status}).`
        );
    }

    const data = await response.json();

    if (
        !data.success ||
        !data.ranking ||
        !Array.isArray(data.ranking.players)
    ) {
        throw new Error(
            "Geen geldige ranking ontvangen."
        );
    }

    if (rankingTitle) {
        rankingTitle.textContent =
            data.ranking.name || "Ranking";
    }

    rankingLoading.style.display = "none";

    const profileUrl =
    localStorage.getItem("myProfileUrl");

let profilePlayerName = "";

if (profileUrl) {

    const cleanUrl =
        profileUrl.trim().replace(/\/+$/, "");

    const playerIdMatch =
        cleanUrl.match(/\/(\d+)$/);

    if (playerIdMatch) {

        try {

            const profileResponse = await fetch(
                `https://api.cuescore.com/participant/?id=${playerIdMatch[1]}`
            );

            if (profileResponse.ok) {

                const profilePlayer =
                    await profileResponse.json();

                profilePlayerName =
                    profilePlayer.name ||
                    `${profilePlayer.firstname || ""} ${profilePlayer.lastname || ""}`.trim();
            }

        } catch (error) {

            console.error(
                "Eigen speler voor ranking ophalen mislukt:",
                error
            );
        }
    }
}

    rankingContent.innerHTML = `
        <div class="profile-tournament-ranking-list">

            ${data.ranking.players.map(player => {

    const isOwnPlayer =
        profilePlayerName &&
        player.player.trim().toLowerCase() ===
        profilePlayerName.trim().toLowerCase();

    return `
        <div class="profile-tournament-ranking-row ${isOwnPlayer ? "own-player" : ""}">

                    <div class="profile-tournament-ranking-position">
                        ${player.position}
                    </div>

                    <div class="profile-tournament-ranking-player">
                        ${player.player}
                    </div>

                    <div class="profile-tournament-ranking-points">
                        ${player.points}
                    </div>

                </div>
                        `;
        }).join("")}

        </div>
    `;

    rankingContent.style.display = "block";

} catch (error) {

    console.error(
        "Tornooiranking laden mislukt:",
        error
    );

    rankingLoading.textContent =
        "Ranking kon niet geladen worden.";
}
}


function closeTournamentRanking() {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    const competitionDetailScreen =
        document.getElementById("competitionDetailScreen");

    if (competitionDetailScreen) {
        competitionDetailScreen.classList.add("active");
    }
}

let currentTournamentCountry = null;
let currentTournamentView = "upcoming";
let countryTournamentItems = [];
let countryTournamentVisibleCount = 10;
let countryTournamentOffset = 0;
const countryTournamentCache = {};

function openCountryTournaments(country) {
  currentTournamentCountry = country;
  currentTournamentView = "upcoming";

  const competitionsScreen =
    document.getElementById("competitionsScreen");

  const tournamentsScreen =
    document.getElementById("countryTournamentsScreen");

  const title =
    document.getElementById("countryTournamentsTitle");

  const upcomingTab =
    document.getElementById("countryTournamentsUpcomingTab");

  const pastTab =
    document.getElementById("countryTournamentsPastTab");

  if (title) {
    title.textContent =
      country === "netherlands"
        ? "🇳🇱 Tornooien Nederland"
        : "🇧🇪 Tornooien België";
  }

  if (upcomingTab) {
    upcomingTab.classList.add("active");
  }

  if (pastTab) {
    pastTab.classList.remove("active");
  }

  if (competitionsScreen) {
    competitionsScreen.classList.remove("active");
  }

    if (tournamentsScreen) {
    tournamentsScreen.classList.add("active");
  }

  loadCountryTournaments();
}

function closeCountryTournaments() {
  const tournamentsScreen =
    document.getElementById("countryTournamentsScreen");

  const competitionsScreen =
    document.getElementById("competitionsScreen");

  if (tournamentsScreen) {
    tournamentsScreen.classList.remove("active");
  }

  if (competitionsScreen) {
    competitionsScreen.classList.add("active");
  }
}

function showCountryTournamentView(view) {
  currentTournamentView =
    view === "past" ? "past" : "upcoming";

  const upcomingTab =
    document.getElementById("countryTournamentsUpcomingTab");

  const pastTab =
    document.getElementById("countryTournamentsPastTab");

  if (upcomingTab) {
    upcomingTab.classList.toggle(
      "active",
      currentTournamentView === "upcoming"
    );
  }

    if (pastTab) {
    pastTab.classList.toggle(
      "active",
      currentTournamentView === "past"
    );
  }

  loadCountryTournaments();
}

async function loadCountryTournaments() {
  const list =
    document.getElementById("countryTournamentsList");

  if (!list || !currentTournamentCountry) {
    return;
  }

  countryTournamentItems = [];

countryTournamentVisibleCount =
    currentTournamentView === "past"
        ? 5
        : 10;

countryTournamentOffset = 0;

const cacheKey =
    `${currentTournamentCountry}:${currentTournamentView}`;

if (countryTournamentCache[cacheKey]) {
    countryTournamentItems =
        countryTournamentCache[cacheKey];

    renderCountryTournaments();
    return;
}

  list.innerHTML = `
    <div class="competition-loading">
      Tornooien laden...
    </div>
  `;

  try {
    await loadCountryTournamentPage(0);

countryTournamentCache[cacheKey] =
    [...countryTournamentItems];

renderCountryTournaments();

  } catch (error) {
    console.error(
      "Tornooien ophalen mislukt:",
      error
    );

    list.innerHTML = `
      <div class="competition-loading">
        Tornooien konden niet geladen worden.
      </div>
    `;
  }
}


async function loadCountryTournamentPage(offset) {
  const workerUrl =
    new URL(
      "https://balenzo-cuescore.nicolasmintjens.workers.dev/"
    );

  workerUrl.searchParams.set(
    "type",
    "countryTournaments"
  );

  workerUrl.searchParams.set(
    "country",
    currentTournamentCountry
  );

  workerUrl.searchParams.set(
    "view",
    currentTournamentView
  );

  workerUrl.searchParams.set(
    "offset",
    String(offset)
  );

  const response =
    await fetch(workerUrl.toString(), {
      cache: "no-store"
    });

  if (!response.ok) {
    throw new Error(
      `Worker gaf HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (!data.success) {
    throw new Error(
      data.error || "Tornooien ophalen mislukt"
    );
  }

  const tournaments =
    Array.isArray(data.tournaments)
      ? data.tournaments
      : [];

  countryTournamentItems.push(
    ...tournaments
  );

  countryTournamentOffset = offset;

  return tournaments.length;
}


function renderCountryTournaments() {
  const list =
    document.getElementById("countryTournamentsList");

  if (!list) {
    return;
  }

  if (!countryTournamentItems.length) {
    list.innerHTML = `
      <div class="competition-loading">
        Geen tornooien gevonden.
      </div>
    `;
    return;
  }

  const visibleTournaments =
    countryTournamentItems.slice(
      0,
      countryTournamentVisibleCount
    );

  const cards =
    visibleTournaments
      .map(tournament => {

        let dateText = "";

        if (tournament.starttime) {
          const date =
            new Date(tournament.starttime);

          if (!Number.isNaN(date.getTime())) {
            dateText =
              new Intl.DateTimeFormat(
                "nl-BE",
                {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  year: "numeric"
                }
              ).format(date);
          }
        }

        const details = [];

        if (tournament.discipline) {
          details.push(
            tournament.discipline
          );
        }

        if (tournament.location) {
          details.push(
            tournament.location
          );
        } else if (tournament.organizer) {
          details.push(
            tournament.organizer
          );
        }

        if (
          tournament.numParticipants !== null &&
          tournament.numParticipants !== undefined
        ) {
          details.push(
            `${tournament.numParticipants} deelnemers`
          );
        }

        return `
          <button
  type="button"
  class="competition-card"
  onclick="openCountryTournamentDetail(
    '${escapeCountryTournamentHtml(
      tournament.tournamentId || ""
    )}',
    '${escapeCountryTournamentHtml(
      tournament.url || ""
    )}'
  )"
  style="
    width: 100%;
    border: none;
    cursor: pointer;
    text-align: left;
  "
>
            <div class="competition-icon">
  <span class="competition-country-label">
    ${currentTournamentCountry === "netherlands" ? "NL" : "BE"}
  </span>
</div>

            <div class="competition-info">

              ${
                dateText
                  ? `
                    <div class="competition-subtitle">
                      ${escapeCountryTournamentHtml(
                        dateText
                      )}
                    </div>
                  `
                  : ""
              }

              <div class="competition-title">
                ${escapeCountryTournamentHtml(
                  tournament.name || "Tornooi"
                )}
              </div>

              ${
                details.length
                  ? `
                    <div class="competition-subtitle">
                      ${escapeCountryTournamentHtml(
                        details.join(" • ")
                      )}
                    </div>
                  `
                  : ""
              }

            </div>

            <div class="competition-arrow">
              ›
            </div>
          </button>
        `;
      })
      .join("");

  const moreButton = `
  <button
    type="button"
    class="competition-card country-tournament-load-more"
    onclick="loadMoreCountryTournaments()"
    style="
      width: 100%;
      border: none;
      cursor: pointer;
      justify-content: center;
    "
  >
    <div
      class="competition-title"
      style="text-align: center;"
    >
      Meer tornooien laden
    </div>
  </button>
`;

  list.innerHTML =
    cards +
    (
      countryTournamentVisibleCount <
      countryTournamentItems.length
        ? moreButton
        : countryTournamentItems.length === 50 ||
          countryTournamentItems.length > 50
          ? moreButton
          : ""
    );
}


async function loadMoreCountryTournaments() {
  const list =
    document.getElementById("countryTournamentsList");

  if (!list) {
    return;
  }

  /*
   * Er zijn nog reeds opgehaalde tornooien
   * die niet zichtbaar zijn.
   */
  if (
    countryTournamentVisibleCount <
    countryTournamentItems.length
  ) {
    countryTournamentVisibleCount +=
    currentTournamentView === "past"
        ? 5
        : 10;

renderCountryTournaments();
return;
  }

  /*
   * De huidige CueScore-pagina is opgebruikt.
   * Haal de volgende 50 op.
   */
  const nextOffset =
    countryTournamentOffset + 50;

  try {
    const amountLoaded =
      await loadCountryTournamentPage(
        nextOffset
      );

    if (!amountLoaded) {
      renderCountryTournaments();
      return;
    }

    countryTournamentVisibleCount +=
    currentTournamentView === "past"
        ? 5
        : 10;

renderCountryTournaments();

  } catch (error) {
    console.error(
      "Meer tornooien ophalen mislukt:",
      error
    );
  }
}

function openCountryTournamentDetail(
  tournamentId,
  tournamentUrl
) {
  if (!tournamentId) {
    return;
  }

  /*
   * Bewaren waar we vandaan komen.
   * Dit gebruiken we straks voor de terugknop.
   */
  sessionStorage.setItem(
    "competitionDetailSource",
    "countryTournaments"
  );

  sessionStorage.setItem(
    "countryTournamentCountry",
    currentTournamentCountry || ""
  );

  sessionStorage.setItem(
    "countryTournamentView",
    currentTournamentView || "upcoming"
  );

  sessionStorage.setItem(
    "countryTournamentUrl",
    tournamentUrl || ""
  );

  openCompetitionDetail(
    String(tournamentId),
    "countryTournaments"
  );
}

function escapeCountryTournamentHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isTournamentDetailSource(detailSource) {
    return (
        detailSource === "profileTournaments" ||
        detailSource === "countryTournaments"
    );
}

async function openCompetitionDetail(tournamentId, detailSourceOverride = null) {

if (detailSourceOverride) {
    sessionStorage.setItem(
        "competitionDetailSource",
        detailSourceOverride
    );
} else {
    sessionStorage.removeItem(
        "competitionDetailSource"
    );
}

document.querySelectorAll(".competition-tab-panel").forEach(panel => {
    panel.style.display = "none";
});

document.querySelectorAll(".competition-detail-tab").forEach(tab => {
    tab.classList.remove("active");
});

const overviewPanel =
    document.getElementById("competitionTabOverview");

const overviewTab =
    document.querySelector(
        '.competition-detail-tab[onclick*="overview"]'
    );

if (overviewPanel) {
    overviewPanel.style.display = "block";
}

if (overviewTab) {
    overviewTab.classList.add("active");
}

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    const detailScreen =
        document.getElementById("competitionDetailScreen");

    detailScreen.classList.add("active");

    const detailSource =
    sessionStorage.getItem("competitionDetailSource");

document.getElementById("competitionDetailTitle").textContent =
    isTournamentDetailSource(detailSource)
        ? "Tornooi"
        : "Competitie";

    const teamsHeadingOnLoad =
    document.getElementById("competitionTeamsTitle");

if (teamsHeadingOnLoad) {
    teamsHeadingOnLoad.textContent =
        isTournamentDetailSource(detailSource)
            ? tr("competition.players", "Spelers")
            : tr("common.teams", "Teams");
}    

const teamsTabOnLoad =
    document.getElementById("competitionTeamsTab");

if (teamsTabOnLoad) {
    teamsTabOnLoad.textContent =
        isTournamentDetailSource(detailSource)
            ? tr("competition.players", "Spelers")
            : tr("common.teams", "Teams");
}

    document.getElementById("competitionName").textContent =
        "Competitie laden...";

    document.getElementById("competitionStatus").textContent = "";
    document.getElementById("competitionDate").textContent = "";
    document.getElementById("competitionDiscipline").textContent = "";

    try {

        const response = await fetch(
            `https://api.cuescore.com/tournament/?id=${tournamentId}`
        );

        const data = await response.json();

        currentCompetitionData = data;

        currentCompetitionTournamentId = String(tournamentId);

        const linkedProfilePlayerName =
            await getLinkedProfilePlayerName();

        startCompetitionLiveRefresh();

        const cueScoreLink =
    document.getElementById("competitionCueScoreLink");

if (cueScoreLink) {

    const cueScoreUrls = {
    "74130085": "https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+EERSTE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130085",
    "74130109": "https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+TWEEDE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130109",
    "74130127": "https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+DERDE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130127",
    "74130139": "https://cuescore.com/tournament/%2A%2A%2ABEKER%252FCOUPE+BPBF+VLAANDEREN+2026%2A%2A%2A/74130139",
    "83574892": "https://cuescore.com/tournament/Pool+Tweede+Divisie+Zuid+2026%252F2027/83574892",

    "85928236": "https://cuescore.com/tournament/POULE+1+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928236",
    "85928569": "https://cuescore.com/tournament/POULE+2+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928569",
    "85928635": "https://cuescore.com/tournament/POULE+3+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928635",
    "85928797": "https://cuescore.com/tournament/POULE+4+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928797",
    "85929085": "https://cuescore.com/tournament/POULE+5+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85929085"
};

    const countryTournamentUrl =
        detailSource === "countryTournaments"
            ? sessionStorage.getItem("countryTournamentUrl")
            : "";

    let tournamentCueScoreUrl = "";

if (
    isTournamentDetailSource(detailSource) &&
    data.name
) {
    const tournamentSlug =
        encodeURIComponent(data.name)
            .replace(/%20/g, "+")
            .replace(/%/g, "%25");

    tournamentCueScoreUrl =
        `https://cuescore.com/tournament/${tournamentSlug}/${tournamentId}`;
}

cueScoreLink.href =
    countryTournamentUrl ||
    cueScoreUrls[String(tournamentId)] ||
    tournamentCueScoreUrl ||
    `https://cuescore.com/tournament/${tournamentId}`;

}

        const standingsTab =
    document.querySelector(
        '.competition-detail-tab[onclick*="standings"]'
    );

const mvpTab =
    document.getElementById("competitionMvpTab");

const mvpPanel =
    document.getElementById("competitionTabMvp");

const hasMvp = [
    "74130085",
    "74130109",
    "74130127"
].includes(String(tournamentId));

if (mvpTab && mvpPanel) {
    mvpTab.style.display = hasMvp ? "" : "none";
    mvpPanel.style.display = "none";
}

const standingsPanel =
    document.getElementById("competitionTabStandings");

if (String(tournamentId) === "74130139") {

    standingsTab.style.display = "none";
    standingsPanel.style.display = "none";

} else {

    standingsTab.style.display = "";
}

        const competitionTitles = {
    "74130085": tr("competition.firstDivision", "Eerste Klasse"),
    "74130109": tr("competition.secondDivision", "Tweede Klasse"),
    "74130127": tr("competition.thirdDivision", "Derde Klasse"),
    "74130139": tr("competition.cup", "Beker"),
    "83574892": "Competitie NL",

    "85928236": tr("competition.breakPlay1", "Break & Play Reeks 1"),
    "85928569": tr("competition.breakPlay2", "Break & Play Reeks 2"),
    "85928635": tr("competition.breakPlay3", "Break & Play Reeks 3"),
    "85928797": tr("competition.breakPlay4", "Break & Play Reeks 4"),
    "85929085": tr("competition.breakPlay5", "Break & Play Reeks 5")
};

const breakAndPlayTournamentIds = [
    "85928236",
    "85928569",
    "85928635",
    "85928797",
    "85929085"
];

const isBreakAndPlayDetail =
    breakAndPlayTournamentIds.includes(String(tournamentId));

const competitionDetailTitle =
    document.getElementById("competitionDetailTitle");

if (competitionDetailTitle) {

    if (isTournamentDetailSource(detailSource)) {

        competitionDetailTitle.textContent = "Tornooi";

    } else if (isBreakAndPlayDetail) {

        competitionDetailTitle.innerHTML = `
            <span class="competition-detail-breakplay-title">
                <img
                    src="breakplayicon.png"
                    alt=""
                    class="competition-detail-breakplay-logo"
                >
                <span>Break & Play</span>
            </span>
        `;

    } else {

        competitionDetailTitle.textContent = "Competitie";
    }
}

        document.getElementById("competitionName").textContent =
            data.name.replace(/\*/g, "");

        document.getElementById("competitionStatus").textContent =
            `Status: ${data.status}`;

        document.getElementById("competitionDate").textContent =
            `Periode: ${data.displayDate}`;

        document.getElementById("competitionDiscipline").textContent =
            `${tr("common.discipline", "Discipline")}: ${data.discipline}`;

const mvpContainer =
    document.getElementById("competitionMvpList");

if (hasMvp && mvpContainer) {
    mvpContainer.innerHTML = "MVP laden...";

    try {
        const mvpResponse = await fetch(
            `https://balenzo-cuescore.nicolasmintjens.workers.dev/?tournamentId=${tournamentId}&type=mvp`
        );

        const mvpData = await mvpResponse.json();

        if (
    mvpData.success &&
    Array.isArray(mvpData.players) &&
    mvpData.players.length > 0
) {
    const balEnzoFilter =
    document.getElementById("competitionMvpBalEnzoOnly");

const renderMvp = () => {
    let rankedPlayers =
        mvpData.players.filter(player => player.position !== null);

    if (balEnzoFilter && balEnzoFilter.checked) {
        rankedPlayers = rankedPlayers.filter(player =>
            player.team.toLowerCase().includes("bal")
        );
    }

    mvpContainer.innerHTML = rankedPlayers.map(player => `
        <div
    class="competition-card"
    onclick="openMvpPlayerDetail('${player.player.replace(/'/g, "\\'")}', '${player.team.replace(/'/g, "\\'")}', '${player.mvp}')"
    style="cursor:pointer;"
>

            <div class="competition-icon">
                ${
                    player.position === 1 ? "🥇" :
                    player.position === 2 ? "🥈" :
                    player.position === 3 ? "🥉" :
                    player.position
                }
            </div>

            <div class="competition-info">

                <div class="competition-title">
                    ${player.player}
                </div>

                <div class="competition-subtitle">
                    ${player.team}
                </div>

            </div>

            <div class="standings-points">
                ${player.mvp}
            </div>

        </div>
    `).join("");
};

renderMvp();

if (balEnzoFilter) {
    balEnzoFilter.onchange = renderMvp;
}

}

    } catch (error) {
        console.error("MVP laden mislukt:", error);
    }
}

const rankingLinkContainer =
    document.getElementById(
        "competitionRankingLinkContainer"
    );

if (rankingLinkContainer) {
    rankingLinkContainer.innerHTML = "";
    rankingLinkContainer.style.display = "none";
}

if (isTournamentDetailSource(detailSource)) {

    const profileStandingsContainer =
        document.getElementById("competitionStandingsList");

    if (profileStandingsContainer) {
        profileStandingsContainer.innerHTML =
            `<p>${tr("competition.loadingStandings", "Stand laden...")}</p>`;
    }

    (async () => {
        try {
            const standingsResponse = await fetch(
                `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=tournamentStandings&tournamentId=${tournamentId}`
            );

            if (!standingsResponse.ok) {
                throw new Error(`Stand kon niet geladen worden (${standingsResponse.status}).`);
            }

            const standingsData = await standingsResponse.json();

            if (
                currentCompetitionTournamentId !== String(tournamentId) ||
                !isTournamentDetailSource(sessionStorage.getItem("competitionDetailSource"))
            ) {
                return;
            }

            const standings =
                standingsData.success && Array.isArray(standingsData.standings)
                    ? standingsData.standings
                    : [];

            const container =
                document.getElementById("competitionStandingsList");

            if (!container) {
                return;
            }

            if (!standings.length) {
                container.innerHTML =
                    `<p>${tr("competition.noStandings", "Geen stand beschikbaar.")}</p>`;
                return;
            }

            const firstPlace =
    standings.find(player => Number(player.position) === 1);

const secondPlace =
    standings.find(player => Number(player.position) === 2);

const thirdPlaces =
    standings.filter(player => Number(player.position) === 3);

container.innerHTML = `

    <div class="tournament-podium">

        <div class="tournament-podium-place tournament-podium-first">
            <div class="tournament-podium-medal">🥇</div>
            <div class="tournament-podium-name">
                ${firstPlace ? firstPlace.player : ""}
            </div>
            <div class="tournament-podium-number">1</div>
        </div>

        <div class="tournament-podium-place tournament-podium-second">
            <div class="tournament-podium-medal">🥈</div>
            <div class="tournament-podium-name">
                ${secondPlace ? secondPlace.player : ""}
            </div>
            <div class="tournament-podium-number">2</div>
        </div>

        <div class="tournament-podium-place tournament-podium-third">
            <div class="tournament-podium-medal">🥉</div>

            ${thirdPlaces.map(player => `
                <div class="tournament-podium-name">
                    ${player.player}
                </div>
            `).join("")}

            <div class="tournament-podium-number">
                    3
                </div>
                </div>

            </div>

    <div class="profile-tournament-standings">
        ${standings.map(player => `
                     <div class="profile-tournament-standing-row">
                            <div class="profile-tournament-standing-position">
    ${player.position}
</div>
                            <div class="profile-tournament-standing-player">
                                <div class="profile-tournament-standing-name ${
                                    isLinkedProfilePlayer(
                                        player.player,
                                        linkedProfilePlayerName
                                    )
                                        ? "linked-profile-player"
                                        : ""
                                }">
                                    ${player.player}
                                </div>
                                <div class="profile-tournament-standing-stats">
                                    Wedstrijden:
                                    <strong>${player.matches}</strong>
                                    (${player.matchesWon}/${player.matchesLost})
                                    · Frames:
                                    <strong>${player.frames}</strong>
                                    (${player.framesWon}/${player.framesLost})
                                </div>
                            </div>
                            <div class="profile-tournament-standing-percentage">
                                ${player.winPercentage}%
                            </div>
                        </div>
                    `).join("")}
                </div>
            `;

        } catch (error) {
            const container =
                document.getElementById("competitionStandingsList");

            if (
                container &&
                currentCompetitionTournamentId === String(tournamentId)
            ) {
                container.innerHTML =
                    `<p>${tr("competition.noStandings", "Geen stand beschikbaar.")}</p>`;
            }
        }
    })();

    (async () => {
        try {
            const rankingLinkResponse = await fetch(
                `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=tournamentRankingLink&tournamentId=${tournamentId}`
            );

            if (!rankingLinkResponse.ok) {
                return;
            }

            const rankingLinkData = await rankingLinkResponse.json();

            if (
                currentCompetitionTournamentId !== String(tournamentId) ||
                !isTournamentDetailSource(sessionStorage.getItem("competitionDetailSource")) ||
                !rankingLinkData.success ||
                !rankingLinkData.ranking
            ) {
                return;
            }

            const container =
                document.getElementById("competitionRankingLinkContainer");

            if (!container) {
                return;
            }

            const ranking = rankingLinkData.ranking;

            container.innerHTML = `
                <button
                    type="button"
                    class="profile-tournament-ranking-button"
                    onclick="openTournamentRanking('${tournamentId}')"
                >
                    <div class="profile-tournament-ranking-button-content">
                        <div class="profile-tournament-ranking-button-icon">
                            🏆
                        </div>
                        <div class="profile-tournament-ranking-button-info">
                            <div class="profile-tournament-ranking-button-title">
                                Ranking
                            </div>
                            <div class="profile-tournament-ranking-button-name">
                                ${ranking.name}
                            </div>
                        </div>
                        <div class="profile-tournament-ranking-button-arrow">
                            ›
                        </div>
                    </div>
                </button>
            `;

            container.style.display = "block";

        } catch (error) {
            // Ranking is extra informatie; het tornooi blijft bruikbaar zonder deze link.
        }
    })();
}

const standingsContainer =
    document.getElementById("competitionStandingsList");

const isBreakAndPlay = [
    "85928236",
    "85928569",
    "85928635",
    "85928797",
    "85929085"
].includes(String(tournamentId));

const teamsTab =
    document.querySelector(
        '.competition-detail-tab[onclick*="teams"]'
    );

const teamsPanel =
    document.getElementById("competitionTabTeams");

if (teamsTab && teamsPanel) {

    if (isBreakAndPlay) {

        teamsTab.style.display = "none";
        teamsPanel.style.display = "none";

    } else {

        teamsTab.style.display = "";

        teamsTab.textContent =
            isTournamentDetailSource(detailSource)
                ? tr("competition.players", "Spelers")
                : tr("common.teams", "Teams");
    }
}

    const standings =
    data.standings && data.standings["1"]
        ? data.standings["1"]
        : [];

if (isTournamentDetailSource(detailSource)) {

    // De individuele tornooistand wordt hierboven asynchroon geladen.
    // Hierdoor blokkeren Overzicht, Wedstrijden en Spelers niet langer.

} else if (!standings.length) {

    standingsContainer.innerHTML =
        `<p>${tr("competition.noStandings", "Geen stand beschikbaar.")}</p>`;

} else {

        standingsContainer.innerHTML = `

    <div class="standings-scroll">

        <div class="standings-table standings-table-full">

            <div class="standings-row standings-header">
                <div>#</div>
                <div>${tr("common.team", "Team")}</div>
                <div>G</div>
                <div>${isBreakAndPlay ? "PTN" : "MP"}</div>
                <div>W</div>
                <div>G</div>
                <div>V</div>
                <div>F+</div>
                <div>F-</div>
                <div>+/-</div>
                <div>Frame %</div>
                <div>Ind. pt.</div>
                <div>Runouts</div>
                <div>Lag wins</div>
                <div>Ptn</div>
            </div>

            ${standings.map(team => {

                const frameDifference = team.frameScore ?? (
                    team.frameWins - team.frameLosses
                );

                const framePercentage =
                    team.frameAvg != null
                        ? (team.frameAvg * 100).toFixed(1) + "%"
                        : "-";

                const isBalEnzo =
                    team.player.name
                        .toLowerCase()
                        .includes("bal' enzo");

                return `

                    <div class="standings-row ${isBalEnzo ? "balenzo-team" : ""}">

                        <div class="standings-position">
                            ${team.position}
                        </div>

                        <div class="standings-team ${
                            isBreakAndPlay &&
                            isLinkedProfilePlayer(
                                team.player.name,
                                linkedProfilePlayerName
                            )
                                ? "linked-profile-player"
                                : ""
                        }">
                            ${team.player.name}
                        </div>

                        <div>${team.played}</div>
                        <div>${isBreakAndPlay ? team.points : team.teamMatchPoints}</div>
                        <div>${team.wins}</div>
                        <div>${team.ties}</div>
                        <div>${team.losses}</div>

                        <div>${team.frameWins}</div>
                        <div>${team.frameLosses}</div>

                        <div>
                            ${frameDifference > 0 ? "+" : ""}
                            ${frameDifference}
                        </div>

                        <div>
                            ${framePercentage}
                        </div>

                        <div>
                            ${team.teamIndividualPoints}
                        </div>

                        <div>
                            ${team.runouts}
                        </div>

                        <div>
                            ${team.lagWins}
                        </div>

                        <div class="standings-points">
                            ${team.points}
                        </div>

                    </div>

                `;

            }).join("")}

        </div>

    </div>

`;

}

const teamsContainer =
    document.getElementById("competitionTeamsList");

const teamsHeading =
    teamsContainer?.previousElementSibling;

if (teamsHeading) {
    teamsHeading.textContent =
        isTournamentDetailSource(detailSource)
            ? tr("competition.players", "Spelers")
            : tr("common.teams", "Teams");
}    

if (isTournamentDetailSource(detailSource)) {

    const tournamentPlayers = new Map();

try {

    const participantsResponse = await fetch(
        `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=tournamentParticipants&tournamentId=${encodeURIComponent(tournamentId)}`
    );

    const participantsData =
        await participantsResponse.json();

    if (
        participantsData.success &&
        Array.isArray(participantsData.participants)
    ) {

        participantsData.participants.forEach(player => {

            if (!player?.name) {
                return;
            }

            const playerKey =
                String(player.id || player.name);

            if (!tournamentPlayers.has(playerKey)) {

                tournamentPlayers.set(playerKey, {
                    id: player.id || null,
                    name: player.name,
                    url: player.url || null
                });
            }
        });
    }

} catch (error) {

    console.warn(
        "Tornooideelnemers konden niet geladen worden:",
        error
    );
}


/*
 * FALLBACK
 * Als CueScore geen deelnemerslijst teruggeeft,
 * halen we de spelers zoals vroeger uit de wedstrijden.
 */
if (!tournamentPlayers.size) {

    (data.matches || []).forEach(match => {

        [
            match.playerA,
            match.playerB
        ].forEach(player => {

            if (!player?.name) {
                return;
            }

            const playerKey =
                String(
                    player.playerId ||
                    player.participantId ||
                    player.id ||
                    player.name
                );

            if (!tournamentPlayers.has(playerKey)) {

                tournamentPlayers.set(playerKey, {
                    id:
                        player.playerId ||
                        player.participantId ||
                        player.id ||
                        null,
                    name: player.name,
                    url: null
                });
            }
        });
    });
}

    const sortedTournamentPlayers =
        [...tournamentPlayers.values()].sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name,
                    appLocale()
                )
        );

    if (!sortedTournamentPlayers.length) {

        teamsContainer.innerHTML =
            `<p>${tr(
                "competition.noPlayers",
                "Geen spelers beschikbaar."
            )}</p>`;

    } else {

        teamsContainer.innerHTML =
            sortedTournamentPlayers.map(player => `

    <div
        class="competition-card"
        onclick="openTournamentPlayerDetail(
            '${String(player.id || "").replace(/'/g, "\\'")}',
            '${String(player.name || "").replace(/'/g, "\\'")}'
        )"
        style="cursor:pointer;"
    >

        <div class="competition-info">

            <div class="competition-title">
                ${player.name}
            </div>

        </div>

        <div class="competition-arrow">
            ›
        </div>

    </div>

`).join("");
    }

} else {

    const teams =
        data.standings && data.standings["1"]
            ? data.standings["1"]
            : [];

    if (!teams.length) {

        teamsContainer.innerHTML =
            `<p>${tr(
                "competition.noTeams",
                "Geen teams beschikbaar."
            )}</p>`;

    } else {

        teamsContainer.innerHTML = teams.map(team => `

            <div
                class="competition-card"
                onclick="openTeamDetail(${team.player.teamId})"
                style="cursor:pointer;"
            >

                <div class="competition-info">

                    <div class="competition-title">
                        ${team.player.name}
                    </div>

                    <div class="competition-subtitle">
                        ${team.position}${tr(
                            "competition.placeSuffix",
                            "e"
                        )} ${tr(
                            "competition.place",
                            "plaats"
                        )}
                    </div>

                </div>

                <div class="competition-arrow">
                    ›
                </div>

            </div>

        `).join("");
    }
}

const matchesContainer =
    document.getElementById("competitionMatchesList");

const matches = data.matches || [];

const overviewDynamic =
    document.getElementById("competitionOverviewDynamic");

if (overviewDynamic) {

    const liveMatches = matches.filter(match =>
        Number(match.matchstatusCode) === 1
    );

    if (liveMatches.length > 0) {

        overviewDynamic.innerHTML = `
            <div class="competition-overview-section">

                <div class="competition-overview-section-title">
                    🔴 ${tr("competition.liveMatches", "Live wedstrijden")}
                </div>

                <div class="competition-overview-matches">

                    ${liveMatches.map(match => {

                        const tableText =
                            match.table?.tableId
                                ? ` · ${tr("common.table", "Tafel")} ${match.table.tableId}`
                                : "";

                        return `
                            <button
                                type="button"
                                class="competition-overview-live-match"
                                onclick="focusCompetitionMatch(${match.matchId})"
                            >

                                <div class="competition-overview-live-label">
                                    ${tr("common.live", "Live")}${tableText}
                                </div>

                                <div class="competition-overview-live-teams">

                                    <div class="competition-overview-live-team ${
                                        (isBreakAndPlay || isTournamentDetailSource(detailSource)) &&
                                        isLinkedProfilePlayer(match.playerA?.name, linkedProfilePlayerName)
                                            ? "linked-profile-player"
                                            : ""
                                    }">
                                        ${match.playerA?.name || "-"}
                                    </div>

                                    <div class="competition-overview-live-score">
                                        ${match.scoreA ?? 0}
                                        -
                                        ${match.scoreB ?? 0}
                                    </div>

                                    <div class="competition-overview-live-team competition-overview-live-team-away ${
                                        (isBreakAndPlay || isTournamentDetailSource(detailSource)) &&
                                        isLinkedProfilePlayer(match.playerB?.name, linkedProfilePlayerName)
                                            ? "linked-profile-player"
                                            : ""
                                    }">
                                        ${match.playerB?.name || "-"}
                                    </div>

                                </div>

                            </button>
                        `;
                    }).join("")}

                </div>

            </div>
        `;

    } else {

        const nextRound =
            getNextCompetitionRound(matches);

        if (!nextRound || !nextRound.matches.length) {

    if (isTournamentDetailSource(detailSource)) {
    overviewDynamic.innerHTML = "";
} else {
        overviewDynamic.innerHTML = `
            <div class="competition-overview-section">

                <div class="competition-overview-section-title">
                    📅 ${tr("competition.nextMatchday", "Volgende speeldag")}
                </div>

                <div class="competition-overview-empty">
                    ${tr(
                        "competition.noScheduledMatches",
                        "Geen geplande wedstrijden"
                    )}
                </div>

            </div>
        `;
    }

} else {

            const roundDate = nextRound.starttime
                ? new Date(nextRound.starttime).toLocaleDateString(
                    appLocale(),
                    {
                        day: "numeric",
                        month: "long"
                    }
                )
                : "";

            const roundTitle =
                translateCompetitionRoundName(
                    nextRound.roundName,
                    nextRound.round
                );

            const sortedRoundMatches =
                [...nextRound.matches].sort((a, b) => {

                    const timeA = a.starttime
                        ? new Date(a.starttime).getTime()
                        : 0;

                    const timeB = b.starttime
                        ? new Date(b.starttime).getTime()
                        : 0;

                    return timeA - timeB;
                });

            overviewDynamic.innerHTML = `
                <div class="competition-overview-section">

                    <div class="competition-overview-section-title">
                        📅 ${tr("competition.nextMatchday", "Volgende speeldag")}
                    </div>

                    <div class="competition-overview-round">
                        ${roundTitle}
                    </div>

                    <div class="competition-overview-matches">

                        ${sortedRoundMatches.map(match => `
                            <div class="competition-overview-match">

                                <div class="competition-overview-match-team ${
                                    (isBreakAndPlay || isTournamentDetailSource(detailSource)) &&
                                    isLinkedProfilePlayer(match.playerA?.name, linkedProfilePlayerName)
                                        ? "linked-profile-player"
                                        : ""
                                }">
                                    ${match.playerA?.name || "-"}
                                </div>

                                <div class="competition-overview-match-versus">
                                    –
                                </div>

                                <div class="competition-overview-match-team competition-overview-match-team-away ${
                                    (isBreakAndPlay || isTournamentDetailSource(detailSource)) &&
                                    isLinkedProfilePlayer(match.playerB?.name, linkedProfilePlayerName)
                                        ? "linked-profile-player"
                                        : ""
                                }">
                                    ${match.playerB?.name || "-"}
                                </div>

                            </div>
                        `).join("")}

                    </div>

                </div>
            `;
        }
    }
}

const upcomingFilter =
    document.getElementById("competitionMatchesUpcomingOnly");

const teamFilter =
    document.getElementById("competitionMatchesTeamFilter");

// Teams voor het keuzemenu verzamelen
if (teamFilter) {

    const teamNames = new Set();

    (data.matches || []).forEach(match => {

        if (match.playerA?.name) {
            teamNames.add(match.playerA.name);
        }

        if (match.playerB?.name) {
            teamNames.add(match.playerB.name);
        }

    });

    const sortedTeamNames =
        [...teamNames].sort((a, b) =>
            a.localeCompare(b, "nl")
        );

    const usePlayerLabels =
    isBreakAndPlay ||
    isTournamentDetailSource(detailSource);

teamFilter.innerHTML = `
    <option value="">
        ${
            usePlayerLabels
                ? tr("filters.allPlayers", "Alle spelers")
                : tr("filters.allTeams", "Alle teams")
        }
    </option>

    ${sortedTeamNames.map(teamName => `
        <option value="${teamName}">
            ${teamName}
        </option>
    `).join("")}
`;

}

if (!matches.length) {

    matchesContainer.innerHTML =
        `<p>${tr("competition.noMatches", "Geen wedstrijden beschikbaar.")}</p>`;

} else {

let matchesToShow = matches;

if (upcomingFilter && upcomingFilter.checked) {
    matchesToShow = matches.filter(
        match => match.matchstatus !== "finished"
    );
}

const renderMatches = () => {

    matchesToShow = matches;

    // Alleen nog te spelen
    if (upcomingFilter && upcomingFilter.checked) {
        matchesToShow = matchesToShow.filter(
            match => match.matchstatus !== "finished"
        );
    }

    // Filter op gekozen team
    if (teamFilter && teamFilter.value) {

        const selectedTeam = teamFilter.value;

        matchesToShow = matchesToShow.filter(match =>
            match.playerA?.name === selectedTeam ||
            match.playerB?.name === selectedTeam
        );
    }

 // Wedstrijden sorteren op speelronde
let sortedMatches;

if (String(tournamentId) === "74130139") {

    function getCupRoundOrder(roundName) {

    const name = (roundName || "")
        .toLowerCase()
        .trim();

    const cupRounds = {
        "round 1": 1,
        "winner round 1": 2,
        "winners qualification": 3,
        "loser round 1": 4,
        "loser round 2": 5,
        "losers qualification": 6,
        "quarter final": 7,
        "semi final": 8,
        "final": 9
    };

    return cupRounds[name] ?? 999;
}

    sortedMatches = [...matchesToShow].sort((a, b) => {

    const getTournamentRoundName = match => {

        const roundCode =
            String(
                match.roundCode ||
                match.roundType ||
                match.stage ||
                ""
            )
            .trim()
            .toLowerCase();

        if (roundCode === "winnerqualification") {
            return "Winners qualification";
        }

        if (roundCode === "loserqualification") {
            return "Losers qualification";
        }

        return match.roundName;
    };

    const orderA =
        getProfileTournamentRoundOrder(
            getTournamentRoundName(a),
            a.round
        );

    const orderB =
        getProfileTournamentRoundOrder(
            getTournamentRoundName(b),
            b.round
        );

    if (orderA !== orderB) {
        return orderA - orderB;
    }

    return (a.matchno || 0) - (b.matchno || 0);
});

} else if (isTournamentDetailSource(detailSource)) {

    function getProfileTournamentRoundOrder(roundName, roundNumber) {

        const name = String(roundName || "")
            .toLowerCase()
            .trim();

        const roundMatch = name.match(/^round\s+(\d+)$/i);
        if (roundMatch) {
            return Number(roundMatch[1]) * 100;
        }

        const winnersRoundMatch =
            name.match(/^winner(?:s)?\s+round\s+(\d+)$/i);
        if (winnersRoundMatch) {
            return Number(winnersRoundMatch[1]) * 100 + 10;
        }

        const losersRoundMatch =
            name.match(/^loser(?:s)?\s+round\s+(\d+)$/i);
        if (losersRoundMatch) {
            return Number(losersRoundMatch[1]) * 100 + 20;
        }

        const specialRounds = {
    "winners qualification": 900,
    "winner qualification": 900,
    "losers qualification": 910,
    "loser qualification": 910,
    "last 32": 920,
    "last 16": 930,
    "last sixteen": 930,
    "round of 16": 930,
    "quarter final": 940,
    "quarter finals": 940,
    "semi final": 950,
    "semi finals": 950,
    "third place": 960,
    "bronze final": 960,
    "final": 970
};

        if (specialRounds[name] != null) {
            return specialRounds[name];
        }

        const numericRound = Number(roundNumber);
        if (Number.isFinite(numericRound)) {
            return 500 + numericRound;
        }

        return 9999;
    }

    sortedMatches = [...matchesToShow].sort((a, b) => {

    const getTournamentRoundName = match => {

        const roundCode =
            String(
                match.roundCode ||
                match.roundType ||
                match.stage ||
                ""
            )
            .trim()
            .toLowerCase();

        if (roundCode === "winnerqualification") {
            return "Winners qualification";
        }

        if (roundCode === "loserqualification") {
            return "Losers qualification";
        }

        return match.roundName;
    };

    const orderA =
        getProfileTournamentRoundOrder(
            getTournamentRoundName(a),
            a.round
        );

    const orderB =
        getProfileTournamentRoundOrder(
            getTournamentRoundName(b),
            b.round
        );

    if (orderA !== orderB) {
        return orderA - orderB;
    }

    return (a.matchno || 0) - (b.matchno || 0);
});

} else {

    sortedMatches = [...matchesToShow].sort((a, b) => {
        return (a.round || 0) - (b.round || 0);
    });

}


// Wedstrijden groeperen per speelronde
const matchesByRound = {};

sortedMatches.forEach(match => {

    let roundName =
        match.roundName ||
        `${tr("competition.round", "Speelronde")} ${match.round || ""}`;

    if (isTournamentDetailSource(detailSource)) {

        const roundCode =
            String(
                match.roundCode ||
                match.roundType ||
                match.stage ||
                ""
            )
            .trim()
            .toLowerCase();

        if (roundCode === "winnerqualification") {
            roundName = "Winners qualification";
        }

        if (roundCode === "loserqualification") {
            roundName = "Losers qualification";
        }
    }

    if (!matchesByRound[roundName]) {
        matchesByRound[roundName] = [];
    }

    matchesByRound[roundName].push(match);

});


// HTML opbouwen
matchesContainer.innerHTML =
    Object.entries(matchesByRound).map(([roundName, roundMatches]) => `

        <div class="competition-round">

            <div class="competition-round-title">
                ${translateCompetitionRoundName(roundName, roundMatches?.[0]?.round)}
            </div>

            ${roundMatches.map(match => {

                const isFinished =
                    match.matchstatus === "finished";

                const isLive =
                    Number(match.matchstatusCode) === 1;    

                    const isBalEnzoMatch =
    match.playerA?.name?.toLowerCase().includes("bal' enzo") ||
    match.playerB?.name?.toLowerCase().includes("bal' enzo");

                const date = match.starttime
                    ? new Date(match.starttime).toLocaleDateString(
                        appLocale(),
                        {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                        }
                    )
                    : tr("common.unknownDate", "Datum onbekend");

                const time = match.starttime
                    ? new Date(match.starttime).toLocaleTimeString(
                        appLocale(),
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    )
                    : "";

                return `

                    <div
    class="competition-match-card ${isBalEnzoMatch ? "balenzo-match" : ""} ${isFinished ? "match-finished" : ""} ${isLive ? "match-live" : ""}"
    data-match-id="${match.matchId}"
    onclick="openMatchDetail(${match.matchId}, ${tournamentId})"
>

                        <div class="competition-match-date">
                            ${date}
                            ${time ? ` · ${time}` : ""}
                        </div>


                        <div class="competition-match-teams">

                            <div class="competition-match-team ${
                                (isBreakAndPlay || isTournamentDetailSource(detailSource)) &&
                                isLinkedProfilePlayer(
                                    match.playerA?.name,
                                    linkedProfilePlayerName
                                )
                                    ? "linked-profile-player"
                                    : ""
                            }">
                                ${match.playerA?.name || "Onbekend"}
                            </div>

                            <div class="competition-match-score">
                                ${isFinished || isLive
    ? `${match.scoreA ?? 0} - ${match.scoreB ?? 0}`
    : "vs"}
                            </div>

                            <div class="competition-match-team competition-match-team-away ${
                                (isBreakAndPlay || isTournamentDetailSource(detailSource)) &&
                                isLinkedProfilePlayer(
                                    match.playerB?.name,
                                    linkedProfilePlayerName
                                )
                                    ? "linked-profile-player"
                                    : ""
                            }">
                                ${match.playerB?.name || "Onbekend"}
                            </div>

                        </div>


                        <div class="competition-match-status">

                            ${isLive
    ? `🔴 ${tr("common.live", "Live")}`
    : isFinished
        ? tr("common.played", "Gespeeld")
        : tr("common.planned", "Gepland")}

                        </div>

                        <div class="competition-match-venue">
    📍 ${getCompetitionMatchVenue(match) || "Locatie niet bekend"}
</div>

                    </div>

                `;

           }).join("")}

        </div>

    `).join("");

}

renderMatches();

if (upcomingFilter) {
    upcomingFilter.onchange = renderMatches;
}

if (teamFilter) {
    teamFilter.onchange = renderMatches;
}

};

    } catch (error) {

        console.error("CueScore laden mislukt:", error);

        document.getElementById("competitionName").textContent =
            "Kon competitie niet laden.";

    }

}

function startCompetitionLiveRefresh() {

    if (competitionLiveRefreshTimer) {
        clearInterval(competitionLiveRefreshTimer);
        competitionLiveRefreshTimer = null;
    }

    if (!currentCompetitionTournamentId) {
        return;
    }

    competitionLiveRefreshTimer = setInterval(async () => {

        const tournamentId =
            currentCompetitionTournamentId;

        try {

            const response = await fetch(
                `https://api.cuescore.com/tournament/?id=${tournamentId}`
            );

            if (!response.ok) {
                return;
            }

            const data = await response.json();

            if (
                currentCompetitionTournamentId !== tournamentId
            ) {
                return;
            }

            if (!Array.isArray(data.matches)) {
                return;
            }

            currentCompetitionData = data;

            updateCompetitionLiveData(
                tournamentId,
                data.matches
            );

        } catch (error) {

            console.warn(
                "Competitie live-update mislukt:",
                error
            );

        }

    }, 15000);
}

function updateCompetitionLiveData(tournamentId, matches) {

    if (
        String(tournamentId) !==
        String(currentCompetitionTournamentId)
    ) {
        return;
    }

    if (!Array.isArray(matches)) {
        return;
    }

    const liveMatches = matches.filter(match =>
        Number(match.matchstatusCode) === 1
    );

    /*
     * Bestaande wedstrijdkaarten bijwerken.
     * We bouwen de Wedstrijden-tab niet opnieuw op,
     * zodat filters en scrollpositie behouden blijven.
     */
    matches.forEach(match => {

        const matchCard =
            document.querySelector(
                `.competition-match-card[data-match-id="${match.matchId}"]`
            );

        if (!matchCard) {
            return;
        }

        const isLive =
            Number(match.matchstatusCode) === 1;

        const isFinished =
            match.matchstatus === "finished";

        matchCard.classList.toggle(
            "match-live",
            isLive
        );

        matchCard.classList.toggle(
            "match-finished",
            isFinished
        );

        const scoreElement =
            matchCard.querySelector(
                ".competition-match-score"
            );

        if (scoreElement) {

            scoreElement.textContent =
                isLive || isFinished
                    ? `${match.scoreA ?? 0} - ${match.scoreB ?? 0}`
                    : "vs";
        }

        const statusElement =
            matchCard.querySelector(
                ".competition-match-status"
            );

        if (statusElement) {

            statusElement.textContent =
                isLive
                    ? `🔴 ${tr("common.live", "Live")}`
                    : isFinished
                        ? tr("common.played", "Gespeeld")
                        : tr("common.planned", "Gepland");
        }
    });

    /*
     * Als er momenteel live wedstrijden zijn,
     * verversen we het liveblok op Overzicht.
     *
     * Wanneer de laatste live wedstrijd stopt,
     * wordt in een volgende stap opnieuw automatisch
     * de volgende speeldag getoond.
     */
    if (liveMatches.length > 0) {

        const overviewDynamic =
            document.getElementById(
                "competitionOverviewDynamic"
            );

        if (!overviewDynamic) {
            return;
        }

        overviewDynamic.innerHTML = `
            <div class="competition-overview-section">

                <div class="competition-overview-section-title">
                    🔴 ${tr(
                        "competition.liveMatches",
                        "Live wedstrijden"
                    )}
                </div>

                <div class="competition-overview-matches">

                    ${liveMatches.map(match => {

                        const tableText =
                            match.table?.tableId
                                ? ` · ${tr(
                                    "common.table",
                                    "Tafel"
                                )} ${match.table.tableId}`
                                : "";

                        return `
                            <button
                                type="button"
                                class="competition-overview-live-match"
                                onclick="focusCompetitionMatch(${match.matchId})"
                            >

                                <div class="competition-overview-live-label">
                                    ${tr("common.live", "Live")}${tableText}
                                </div>

                                <div class="competition-overview-live-teams">

                                    <div class="competition-overview-live-team">
                                        ${match.playerA?.name || "-"}
                                    </div>

                                    <div class="competition-overview-live-score">
                                        ${match.scoreA ?? 0}
                                        -
                                        ${match.scoreB ?? 0}
                                    </div>

                                    <div class="competition-overview-live-team competition-overview-live-team-away">
                                        ${match.playerB?.name || "-"}
                                    </div>

                                </div>

                            </button>
                        `;
                    }).join("")}

                </div>

            </div>
        `;
    }

else {

    const overviewDynamic =
        document.getElementById(
            "competitionOverviewDynamic"
        );

    if (!overviewDynamic) {
        return;
    }

    const nextRound =
        getNextCompetitionRound(matches);

    if (!nextRound || !nextRound.matches.length) {

    const detailSource =
        sessionStorage.getItem("competitionDetailSource");

    if (isTournamentDetailSource(detailSource)) {
    overviewDynamic.innerHTML = "";
    return;
}

    overviewDynamic.innerHTML = `
        <div class="competition-overview-section">

            <div class="competition-overview-section-title">
                📅 ${tr(
                    "competition.nextMatchday",
                    "Volgende speeldag"
                )}
            </div>

            <div class="competition-overview-empty">
                ${tr(
                    "competition.noScheduledMatches",
                    "Geen geplande wedstrijden"
                )}
            </div>

        </div>
    `;

    return;
}

    const roundTitle =
        translateCompetitionRoundName(
            nextRound.roundName,
            nextRound.round
        );

    const sortedRoundMatches =
        [...nextRound.matches].sort((a, b) => {

            const timeA = a.starttime
                ? new Date(a.starttime).getTime()
                : 0;

            const timeB = b.starttime
                ? new Date(b.starttime).getTime()
                : 0;

            return timeA - timeB;
        });

    overviewDynamic.innerHTML = `
        <div class="competition-overview-section">

            <div class="competition-overview-section-title">
                📅 ${tr(
                    "competition.nextMatchday",
                    "Volgende speeldag"
                )}
            </div>

            <div class="competition-overview-round">
                ${roundTitle}
            </div>

            <div class="competition-overview-matches">

                ${sortedRoundMatches.map(match => `
                    <div class="competition-overview-match">

                        <div class="competition-overview-match-team">
                            ${match.playerA?.name || "-"}
                        </div>

                        <div class="competition-overview-match-versus">
                            –
                        </div>

                        <div class="competition-overview-match-team competition-overview-match-team-away">
                            ${match.playerB?.name || "-"}
                        </div>

                    </div>
                `).join("")}

            </div>

        </div>
    `;
}

}


/* ===========================
   CLOSE COMPETITION DETAIL
=========================== */

function closeCompetitionDetail() {

    const detailSource =
        sessionStorage.getItem("competitionDetailSource");

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    if (detailSource === "countryTournaments") {

        currentTournamentCountry =
            sessionStorage.getItem("countryTournamentCountry") ||
            currentTournamentCountry ||
            "belgium";

        currentTournamentView =
            sessionStorage.getItem("countryTournamentView") === "past"
                ? "past"
                : "upcoming";

        const tournamentsScreen =
            document.getElementById("countryTournamentsScreen");

        const title =
            document.getElementById("countryTournamentsTitle");

        const upcomingTab =
            document.getElementById("countryTournamentsUpcomingTab");

        const pastTab =
            document.getElementById("countryTournamentsPastTab");

        if (title) {
            title.textContent =
                currentTournamentCountry === "netherlands"
                    ? "🇳🇱 Tornooien Nederland"
                    : "🇧🇪 Tornooien België";
        }

        if (upcomingTab) {
            upcomingTab.classList.toggle(
                "active",
                currentTournamentView === "upcoming"
            );
        }

        if (pastTab) {
            pastTab.classList.toggle(
                "active",
                currentTournamentView === "past"
            );
        }

        if (tournamentsScreen) {
            tournamentsScreen.classList.add("active");
        }

        sessionStorage.removeItem("competitionDetailSource");
        sessionStorage.removeItem("countryTournamentUrl");

        return;
    }

    if (detailSource === "profileTournaments") {

        document
            .getElementById("myProfileScreen")
            .classList.add("active");

        const tournamentsTab =
            document.querySelector(
                '.my-profile-tab[data-profile-tab="tournaments"]'
            );

        showMyProfileTab(
            "tournaments",
            tournamentsTab
        );

const matchesPanel =
    document.getElementById("myProfileTabMatches");

const tournamentsPanel =
    document.getElementById("myProfileTabTournaments");

if (matchesPanel) {
    matchesPanel.style.display = "none";
}

if (tournamentsPanel) {
    tournamentsPanel.style.display = "block";
}

        sessionStorage.removeItem(
            "competitionDetailSource"
        );

        return;
    }

    document
        .getElementById("competitionsScreen")
        .classList.add("active");
}

/* ===========================
   COMPETITIE DETAIL TABS
=========================== */

function showCompetitionTab(tabName, button) {

    document.querySelectorAll(".competition-tab-panel").forEach(panel => {
        panel.style.display = "none";
    });

    document.querySelectorAll(".competition-detail-tab").forEach(tab => {
        tab.classList.remove("active");
    });

    const target = document.getElementById(
        "competitionTab" +
        tabName.charAt(0).toUpperCase() +
        tabName.slice(1)
    );

    if (target) {
        target.style.display = "block";
    }

    if (button) {
        button.classList.add("active");
    }
}

function focusCompetitionMatch(matchId) {

    const matchesTabButton =
        document.querySelector(
            '.competition-detail-tab[onclick*="matches"]'
        );

    showCompetitionTab(
        "matches",
        matchesTabButton
    );

    const upcomingFilter =
        document.getElementById(
            "competitionMatchesUpcomingOnly"
        );

    const teamFilter =
        document.getElementById(
            "competitionMatchesTeamFilter"
        );

    if (upcomingFilter) {
        upcomingFilter.checked = false;
        upcomingFilter.dispatchEvent(
            new Event("change")
        );
    }

    if (teamFilter) {
        teamFilter.value = "";
        teamFilter.dispatchEvent(
            new Event("change")
        );
    }

    requestAnimationFrame(() => {

        const matchCard =
            document.querySelector(
                `.competition-match-card[data-match-id="${matchId}"]`
            );

        if (!matchCard) {
            return;
        }

        matchCard.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        matchCard.classList.add(
            "competition-match-focus"
        );

        setTimeout(() => {
            matchCard.classList.remove(
                "competition-match-focus"
            );
        }, 1800);

    });
}

/* ===========================
   OPEN WEDSTRIJD DETAIL
=========================== */

async function openMatchDetail(matchId, tournamentId) {

    if (!currentCompetitionData) {
        return;
    }

    const match = currentCompetitionData.matches.find(
        item => item.matchId === matchId
    );

    if (!match) {
        console.error("Wedstrijd niet gevonden:", matchId);
        return;
    }

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("matchDetailScreen")
        .classList.add("active");

    const roundName = match.roundName || tr("common.match", "Wedstrijd");

document.getElementById("matchDetailRound").textContent =
    roundName.replace(/^Round\s+/i, "Ronde ");

    const dateText = match.starttime
        ? new Date(match.starttime).toLocaleString(appLocale(), {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })
        : tr("common.unknownDate", "Datum onbekend");

    document.getElementById("matchDetailDate").textContent =
        dateText;

    const teamAElement =
    document.getElementById("matchDetailTeamA");

const teamBElement =
    document.getElementById("matchDetailTeamB");

teamAElement.textContent =
    match.playerA?.name || "Onbekend";

teamBElement.textContent =
    match.playerB?.name || "Onbekend";

teamAElement.classList.remove("winner");
teamBElement.classList.remove("winner");

if (match.matchstatus === "finished") {

    if (match.scoreA > match.scoreB) {
        teamAElement.classList.add("winner");
    }

    if (match.scoreB > match.scoreA) {
        teamBElement.classList.add("winner");
    }

}

    const scoreAElement =
    document.getElementById("matchDetailScoreA");

const scoreBElement =
    document.getElementById("matchDetailScoreB");

if (match.matchstatus === "finished") {

    scoreAElement.textContent = match.scoreA ?? 0;
    scoreBElement.textContent = match.scoreB ?? 0;

} else {

    scoreAElement.textContent = "–";
    scoreBElement.textContent = "–";

}

   const statusElement =
    document.getElementById("matchDetailStatus");

if (match.matchstatus === "finished") {

    if (Number(match.scoreA) === Number(match.scoreB)) {
        statusElement.textContent = tr("common.draw", "Gelijkspel");
    } else {
        statusElement.textContent = tr("common.played", "Gespeeld");
    }

} else {

    statusElement.textContent = "Gepland";

}

statusElement.className =
    "match-detail-status " +
    (match.matchstatus === "finished"
        ? "finished"
        : "planned");


const venueElement =
    document.getElementById("matchDetailVenue");

const matchVenue = getCompetitionMatchVenue(match);

if (matchVenue) {
    venueElement.textContent =
        `📍 ${matchVenue}`;
    venueElement.style.display = "block";
} else {
    venueElement.textContent = "";
    venueElement.style.display = "none";
}


    /* ===========================
       INDIVIDUELE WEDSTRIJDEN
    =========================== */

    const individualContainer =
        document.getElementById("matchIndividualMatches");

    if (!individualContainer) {
        return;
    }

    individualContainer.innerHTML =
        `<p>${tr("match.loadingIndividual", "Individuele wedstrijden laden...")}</p>`;

    try {

        const response = await fetch(
            `https://balenzo-cuescore.nicolasmintjens.workers.dev/?tournamentId=${tournamentId}&matchId=${matchId}`
        );

        const data = await response.json();

        if (
            !data.success ||
            !Array.isArray(data.matches) ||
            data.matches.length === 0
        ) {

            individualContainer.innerHTML =
                `<p>${tr("match.noIndividual", "Geen individuele wedstrijden beschikbaar.")}</p>`;

            return;
        }

        individualContainer.innerHTML =
            data.matches.map(individualMatch => `

                <div class="individual-match-card">

                    <div class="individual-match-header">

                        <span>
                            ${tr("common.match", "Wedstrijd")} ${individualMatch.matchNo}
                        </span>

                        <span>
                            ${individualMatch.discipline}
                            · Race naar ${individualMatch.raceTo}
                        </span>

                    </div>

                    <div class="individual-match-score">

    <div class="individual-match-player ${
        individualMatch.scoreA > individualMatch.scoreB
            ? "winner"
            : ""
    }">
        ${individualMatch.playerA}
    </div>

    <div class="individual-match-score-value">
        ${individualMatch.scoreA}
        -
        ${individualMatch.scoreB}
    </div>

    <div class="individual-match-player individual-match-player-away ${
        individualMatch.scoreB > individualMatch.scoreA
            ? "winner"
            : ""
    }">
        ${individualMatch.playerB}
    </div>

</div>

                    <div class="individual-match-meta">

                        ${individualMatch.displayDate || ""}

                        ${individualMatch.table
                            ? ` · ${individualMatch.table}`
                            : ""}

                    </div>

                </div>

            `).join("");

    } catch (error) {

        console.error(
            "Individuele wedstrijden laden mislukt:",
            error
        );

        individualContainer.innerHTML =
            `<p>${tr("match.individualLoadFailed", "Individuele wedstrijden konden niet geladen worden.")}</p>`;

    }
}

function closeMatchDetail() {

    const detailSource =
        sessionStorage.getItem("competitionDetailSource");

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    if (detailSource === "profileMatches") {

        document
            .getElementById("myProfileScreen")
            .classList.add("active");

        const matchesTab =
            document.querySelector(
                '.my-profile-tab[data-profile-tab="matches"]'
            );

        showMyProfileTab(
            "matches",
            matchesTab
        );

        const playedMatchTab =
    document.querySelector(
        '.my-profile-match-tab[data-match-tab="played"]'
    );

showMyProfileMatchTab(
    "played",
    playedMatchTab
);

        sessionStorage.removeItem(
            "competitionDetailSource"
        );

        sessionStorage.removeItem(
            "profileMatchReturnTab"
        );

        return;
    }

    document
        .getElementById("competitionDetailScreen")
        .classList.add("active");
}

/* ===========================
   OPEN PROFILE TEAM
=========================== */

async function openProfileTeam(teamId, teamName) {

    sessionStorage.setItem("teamDetailSource", "profileTeams");

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("teamDetailScreen")
        .classList.add("active");

    document.getElementById("teamDetailTitle").textContent =
        teamName || tr("common.team", "Team");

    document.getElementById("teamDetailName").textContent =
        teamName || tr("common.team", "Team");

    const positionElement =
        document.getElementById("teamDetailPosition");

    if (positionElement) {
        positionElement.textContent = "";
        positionElement.style.display = "none";
    }

    const venueElement =
        document.getElementById("teamDetailVenue");

    if (venueElement) {
        venueElement.textContent = "";
        venueElement.style.display = "none";
    }

    const playersContainer =
        document.getElementById("teamDetailPlayers");

    playersContainer.innerHTML =
        tr("team.loadingPlayers", "Spelers laden...");

    try {

        const response = await fetch(
            `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=teamParticipants&teamId=${encodeURIComponent(teamId)}`
        );

        if (!response.ok) {
            throw new Error(
                `Teamleden konden niet geladen worden (${response.status}).`
            );
        }

        const data = await response.json();

        if (
            !data.success ||
            !Array.isArray(data.participants)
        ) {
            throw new Error("Geen geldige teamleden ontvangen.");
        }

        const players =
            data.participants
                .filter(player => player?.name)
                .sort((a, b) =>
                    a.name.localeCompare(b.name, "nl")
                );

        playersContainer.innerHTML =
            players.length
                ? players.map(player => `
                    <div
                        class="team-player-card"
                        onclick="openProfileTeamPlayer(
                            '${String(player.id || "").replace(/'/g, "\\'")}',
                            '${String(player.name || "").replace(/'/g, "\\'")}',
                            '${String(teamName || "").replace(/'/g, "\\'")}'
                        )"
                    >
                        <span>${player.name}</span>

                        <span class="team-player-arrow">
                            ›
                        </span>
                    </div>
                `).join("")
                : `
                    <div class="my-profile-empty">
                        Geen spelers gevonden.
                    </div>
                `;

    } catch (error) {

        console.error(
            "Profielteam laden mislukt:",
            error
        );

        playersContainer.innerHTML =
            `<div class="my-profile-empty">
                Spelers konden niet geladen worden.
            </div>`;
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function openProfileTeamPlayer(playerId, playerName, teamName) {

    if (!playerId) {
        return;
    }

    sessionStorage.setItem(
        "profileTeamPlayerTeamName",
        teamName || ""
    );

    openTournamentPlayerDetail(
        playerId,
        playerName
    );

    playerDetailSource = "profileTeam";

    const teamElement =
        document.getElementById("playerDetailTeam");

    if (teamElement) {
        teamElement.textContent = teamName || "";
        teamElement.style.display =
            teamName ? "block" : "none";
    }
}

/* ===========================
   OPEN TEAM DETAIL
=========================== */

async function openTeamDetail(teamId) {

    if (!currentCompetitionData) {
        return;
    }

    const team = currentCompetitionData.standings?.["1"]?.find(
        item => String(item.player?.teamId) === String(teamId)
    );

    if (!team) {
        console.error("Team niet gevonden:", teamId);
        return;
    }

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("teamDetailScreen")
        .classList.add("active");

    document.getElementById("teamDetailTitle").textContent =
        team.player?.name || tr("common.team", "Team");

    document.getElementById("teamDetailName").textContent =
        team.player?.name || tr("common.unknown", "Onbekend");

    const positionElement =
        document.getElementById("teamDetailPosition");

    positionElement.textContent =
        `${team.position}${tr("competition.placeSuffix", "e")} ${tr("competition.place", "plaats")}`;

    positionElement.style.display = "block";

    sessionStorage.removeItem("teamDetailSource");

    const venueElement =
        document.getElementById("teamDetailVenue");

    if (team.player?.venue?.name) {

        venueElement.textContent =
            `📍 ${team.player.venue.name}`;

        venueElement.style.display = "block";

    } else {

        venueElement.textContent = "";
        venueElement.style.display = "none";

    }


    /* ===========================
       SPELERS LADEN
    =========================== */

    const playersContainer =
        document.getElementById("teamDetailPlayers");

    playersContainer.innerHTML =
        tr("team.loadingPlayers", "Spelers laden...");


    const teamMatches =
        (currentCompetitionData.matches || []).filter(match =>

            match.matchstatus === "finished" &&

            (
                String(match.playerA?.teamId) === String(teamId) ||
                String(match.playerB?.teamId) === String(teamId)
            )

        );


        const playerNames = new Set();
const playerIdsByName = new Map();

try {

    /*
     * CueScore-teamleden ophalen.
     * Voor alle competities gebruiken we deze gegevens
     * om de CueScore playerId aan de speler te koppelen.
     *
     * Voor Competitie NL gebruiken we deze lijst ook
     * als spelerslijst, omdat die competitie later start
     * en er nog geen gespeelde wedstrijden hoeven te zijn.
     */
    const rosterResponse = await fetch(
        `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=teamParticipants&teamId=${encodeURIComponent(teamId)}`
    );

    if (rosterResponse.ok) {

        const rosterData =
            await rosterResponse.json();

        if (
            rosterData.success &&
            Array.isArray(rosterData.participants)
        ) {

            rosterData.participants.forEach(player => {

                if (!player?.name) {
                    return;
                }

                if (player.id) {
                    playerIdsByName.set(
                        player.name.trim().toLowerCase(),
                        String(player.id)
                    );
                }

                if (
                    String(currentCompetitionData.tournamentId) ===
                    "83574892"
                ) {
                    playerNames.add(player.name);
                }

            });

        }

    }

    const results = await Promise.all(

            teamMatches.map(async match => {

                const response = await fetch(
                    `https://balenzo-cuescore.nicolasmintjens.workers.dev/?tournamentId=${currentCompetitionData.tournamentId}&matchId=${match.matchId}`
                );

                return {
                    teamMatch: match,
                    data: await response.json()
                };

            })

        );


        results.forEach(result => {

            const teamMatch = result.teamMatch;
            const data = result.data;

            if (!data.success || !Array.isArray(data.matches)) {
                return;
            }

            const teamIsA =
                String(teamMatch.playerA?.teamId) ===
                String(teamId);


            data.matches.forEach(individualMatch => {

                const name =
                    teamIsA
                        ? individualMatch.playerA
                        : individualMatch.playerB;

                if (!name) {
                    return;
                }

                /*
                 * Dubbelwedstrijden voorlopig opsplitsen
                 * in afzonderlijke spelers.
                 */
                name.split("&").forEach(player => {

                    const cleanName =
                        player.trim();

                    if (cleanName) {
                        playerNames.add(cleanName);
                    }

                });

            });

        });


        const allPlayers = [...playerNames];


/* ===========================
   DUBBELE SPELERS VERWIJDEREN
=========================== */

function normalizeName(name) {

    return name
        .toLowerCase()

        // Volledige bijnamen tussen quotes verwijderen
        .replace(/"[^"]*"/g, "")

        // Overgebleven losse aanhalingstekens verwijderen
        .replace(/["']/g, "")

        // Punten naar spaties
        .replace(/\./g, " ")

        // Meerdere spaties samenvoegen
        .replace(/\s+/g, " ")

        .trim();
}


function isAbbreviatedName(name) {

    return /^[A-Z]\./i.test(name.trim());

}


function namesMatch(shortName, fullName) {

    const shortParts =
        normalizeName(shortName).split(" ");

    const fullParts =
        normalizeName(fullName).split(" ");

    if (shortParts.length < 2 || fullParts.length < 2) {
        return false;
    }

    // Achternaam
    const shortLastName =
        shortParts[shortParts.length - 1];

    const fullLastName =
        fullParts[fullParts.length - 1];

    if (shortLastName !== fullLastName) {
        return false;
    }

    // Alles vóór de achternaam zijn voornamen / initialen
    const shortFirstParts =
        shortParts.slice(0, -1);

    const fullFirstParts =
        fullParts.slice(0, -1);

    // Afgekorte naam mag niet méér delen hebben
    // dan de volledige naam
    if (shortFirstParts.length > fullFirstParts.length) {
        return false;
    }

    return shortFirstParts.every((shortPart, index) => {

        const fullPart = fullFirstParts[index];

        if (!fullPart) {
            return false;
        }

        // J = Jolien
        // D = D
        return fullPart.startsWith(shortPart);

    });
}


const normalizedPlayers =
    allPlayers.filter(player => {

        if (!isAbbreviatedName(player)) {
            return true;
        }

        const fullVersionExists =
            allPlayers.some(otherPlayer => {

                if (otherPlayer === player) {
                    return false;
                }

                if (isAbbreviatedName(otherPlayer)) {
                    return false;
                }

                return namesMatch(
                    player,
                    otherPlayer
                );

            });

        return !fullVersionExists;

    });


const uniquePlayers = [];

normalizedPlayers.forEach(player => {

    const normalized = normalizeName(player);

    const existingIndex = uniquePlayers.findIndex(
        existingPlayer =>
            normalizeName(existingPlayer) === normalized
    );

    if (existingIndex === -1) {

        uniquePlayers.push(player);

    } else {

        /*
         * Als dezelfde speler één keer met bijnaam
         * en één keer zonder bijnaam voorkomt,
         * behouden we de versie zonder bijnaam.
         */
        const existingHasNickname =
            /"[^"]*"/.test(uniquePlayers[existingIndex]);

        const currentHasNickname =
            /"[^"]*"/.test(player);

        if (existingHasNickname && !currentHasNickname) {
            uniquePlayers[existingIndex] = player;
        }

    }

});


const sortedPlayers =
    uniquePlayers.sort((a, b) =>
        a.localeCompare(b, "nl")
    );


        if (!sortedPlayers.length) {

            playersContainer.innerHTML =
                `<p>${tr("team.noPlayers", "Geen spelers gevonden.")}</p>`;

            return;
        }


        playersContainer.innerHTML =
    sortedPlayers.map(player => {

        const playerId =
            playerIdsByName.get(
                player.trim().toLowerCase()
            ) || "";

        return `

            <div
                class="team-player-card"
                onclick="openPlayerDetail(
                    '${player.replace(/'/g, "\\'")}',
                    '${teamId}',
                    '${playerId}'
                )"
            >
                <span>${player}</span>

                <span class="team-player-arrow">
                    ›
                </span>
            </div>

        `;

    }).join("");


    } catch (error) {

        console.error(
            "Teamspelers laden mislukt:",
            error
        );

        playersContainer.innerHTML =
            `<p>${tr("team.playersLoadFailed", "Spelers konden niet geladen worden.")}</p>`;

    }
}

function closeTeamDetail() {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    if (
        sessionStorage.getItem("teamDetailSource") ===
        "profileTeams"
    ) {

        document
            .getElementById("myProfileScreen")
            .classList.add("active");

        const teamsTab =
            document.querySelector(
                '.my-profile-tab[data-profile-tab="teams"]'
            );

        showMyProfileTab(
            "teams",
            teamsTab
        );

        return;
    }

    document
        .getElementById("competitionDetailScreen")
        .classList.add("active");
}

/* ===========================
   OPEN PLAYER DETAIL
=========================== */

async function openTournamentPlayerDetail(playerId, playerName) {

    if (!playerId) {
        console.error("Geen playerId gevonden voor tornooispeler:", playerName);
        return;
    }

    playerDetailSource = "tournament";

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("playerDetailScreen")
        .classList.add("active");

    document.getElementById("playerDetailTitle").textContent =
        playerName;

    document.getElementById("playerDetailName").textContent =
        playerName;

    /* Teamtekst verbergen bij tornooispeler */
    const teamElement =
        document.getElementById("playerDetailTeam");

    teamElement.textContent = "";
    teamElement.style.display = "none";

    /* Foto resetten tijdens laden */
    const image =
        document.getElementById("playerDetailImage");

    image.removeAttribute("src");
    image.alt = "";
    image.style.display = "none";

const statsTitle =
    document.querySelector(
        "#playerDetailScreen .player-stats-section .competition-title"
    );

if (statsTitle) {
    statsTitle.textContent = "Rating";
}

    const statsContainer =
        document.getElementById("playerDetailStats");

    const ratingsContainer =
        document.getElementById("playerDetailRatings");

    if (ratingsContainer) {
        ratingsContainer.innerHTML = "";
    }

    statsContainer.innerHTML =
        "Rating laden...";

    try {

        /* Speler + ratings tegelijk ophalen */
        const [
            participantResponse,
            ratingsResponse
        ] = await Promise.all([

            fetch(
                `https://api.cuescore.com/participant/?id=${encodeURIComponent(playerId)}`
            ),

            fetch(
                `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileRatings&playerId=${encodeURIComponent(playerId)}`
            )

        ]);

        if (!participantResponse.ok) {
            throw new Error(
                `Speler kon niet geladen worden (${participantResponse.status}).`
            );
        }

        const player =
            await participantResponse.json();

        const ratingsData =
            ratingsResponse.ok
                ? await ratingsResponse.json()
                : { ratings: [] };

        /* NAAM */
        const displayName =
            player.name ||
            `${player.firstname || ""} ${player.lastname || ""}`.trim() ||
            playerName;

        document.getElementById("playerDetailTitle").textContent =
            displayName;

        document.getElementById("playerDetailName").textContent =
            displayName;

        /* FOTO */
        if (player.image) {

            image.src = player.image;
            image.alt = displayName;
            image.style.display = "";

        }

        /* RATINGS */
        const ratings =
            Array.isArray(ratingsData.ratings)
                ? ratingsData.ratings
                : [];

        if (ratings.length) {

            statsContainer.innerHTML = `
                <div class="my-profile-ratings">

                    ${ratings.map(rating => `

                        <div class="my-profile-rating">

                            <div class="my-profile-rating-value">
                                ${rating.value}
                            </div>

                            <div class="my-profile-rating-name">
                                ${
                                    rating.name === "KNBB Pool Rating"
                                        ? "🇳🇱 "
                                        : rating.name === "P-B-B Pool Rating"
                                            ? "🇧🇪 "
                                            : ""
                                }
                                ${rating.name}
                            </div>

                        </div>

                    `).join("")}

                </div>
            `;

        } else {

            statsContainer.innerHTML =
                `<div class="competition-subtitle">Geen rating beschikbaar</div>`;

        }

    } catch (error) {

        console.error(
            "Tornooispeler laden mislukt:",
            error
        );

        statsContainer.innerHTML =
            `<div class="competition-subtitle">Profiel kon niet geladen worden.</div>`;
    }
}

async function openPlayerDetail(playerName, teamId, playerId = "") {

    if (!currentCompetitionData) {
        return;
    }

    const loadId = ++playerDetailLoadId;

        function normalizePlayerName(name) {

        return name
            .toLowerCase()
            .replace(/"[^"]*"/g, "")
            .replace(/["']/g, "")
            .replace(/\./g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    const team = currentCompetitionData.standings?.["1"]?.find(
        item => String(item.player?.teamId) === String(teamId)
    );

    if (!team) {
        console.error("Team niet gevonden:", teamId);
        return;
    }

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("playerDetailScreen")
        .classList.add("active");

    document.getElementById("playerDetailTitle").textContent =
        playerName;

    document.getElementById("playerDetailName").textContent =
        playerName;

    document.getElementById("playerDetailTeam").textContent =
        team.player?.name || tr("common.team", "Team");

    const statsTitle =
        document.querySelector(
            "#playerDetailScreen .player-stats-section .competition-title"
        );

    if (statsTitle) {
        statsTitle.textContent = "Statistieken";
    }

    const statsContainer =
        document.getElementById("playerDetailStats");

    statsContainer.innerHTML =
        tr("player.loadingStats", "Statistieken laden...");

    const ratingsContainer =
        document.getElementById("playerDetailRatings");

    if (ratingsContainer) {
        ratingsContainer.innerHTML = "";
    }

    const image =
    document.getElementById("playerDetailImage");

if (image) {
    image.removeAttribute("src");
    image.alt = "";
    image.style.display = "none";
}

if (playerId) {

    try {

        const [
            participantResponse,
            ratingsResponse
        ] = await Promise.all([

            fetch(
                `https://api.cuescore.com/participant/?id=${encodeURIComponent(playerId)}`
            ),

            fetch(
                `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileRatings&playerId=${encodeURIComponent(playerId)}`
            )

        ]);

        if (loadId !== playerDetailLoadId) {
            return;
        }

        if (participantResponse.ok) {

            const player =
                await participantResponse.json();

            const displayName =
                player.name ||
                `${player.firstname || ""} ${player.lastname || ""}`.trim() ||
                playerName;

            document.getElementById("playerDetailTitle").textContent =
                displayName;

            document.getElementById("playerDetailName").textContent =
                displayName;

            if (image && player.image) {

                image.src = player.image;
                image.alt = displayName;
                image.style.display = "";

            }

        }

        if (ratingsResponse.ok) {

            const ratingsData =
                await ratingsResponse.json();

            const ratings =
                Array.isArray(ratingsData.ratings)
                    ? ratingsData.ratings
                    : [];

            const ratingsContainer =
                document.getElementById("playerDetailRatings");

            if (ratingsContainer) {

                if (ratings.length) {

                    ratingsContainer.innerHTML = ratings.map(rating => `

                        <div class="my-profile-rating">

                            <div class="my-profile-rating-value">
                                ${rating.value}
                            </div>

                            <div class="my-profile-rating-name">
                                ${
                                    rating.name === "KNBB Pool Rating"
                                        ? "🇳🇱 "
                                        : rating.name === "P-B-B Pool Rating"
                                            ? "🇧🇪 "
                                            : ""
                                }
                                ${rating.name}
                            </div>

                        </div>

                    `).join("");

                } else {

                    ratingsContainer.innerHTML = "";

                }

            }

        }

    } catch (error) {

        console.error(
            "Spelerprofiel laden mislukt:",
            error
        );

    }

}    


    const teamMatches =
        (currentCompetitionData.matches || []).filter(match =>

            match.matchstatus === "finished" &&

            (
                String(match.playerA?.teamId) === String(teamId) ||
                String(match.playerB?.teamId) === String(teamId)
            )

        );


    try {

        const results = await Promise.all(

            teamMatches.map(async match => {

                const response = await fetch(
                    `https://balenzo-cuescore.nicolasmintjens.workers.dev/?tournamentId=${currentCompetitionData.tournamentId}&matchId=${match.matchId}`
                );

                return {
                    teamMatch: match,
                    data: await response.json()
                };

            })

        );

        if (loadId !== playerDetailLoadId) {
            return;
        }


        let played = 0;
        let wins = 0;
        let losses = 0;
        let draws = 0;

        const disciplineStats = {};


        results.forEach(result => {

            const teamMatch = result.teamMatch;
            const data = result.data;

            if (!data.success || !Array.isArray(data.matches)) {
                return;
            }

            const teamIsA =
                String(teamMatch.playerA?.teamId) ===
                String(teamId);


            data.matches.forEach(individualMatch => {

                const sideName =
                    teamIsA
                        ? individualMatch.playerA
                        : individualMatch.playerB;

                if (!sideName) {
                    return;
                }

                const players =
                    sideName
                        .split("&")
                        .map(name => name.trim());

                const isThisPlayer =
    players.some(name =>
        normalizePlayerName(name) ===
        normalizePlayerName(playerName)
    );

                if (!isThisPlayer) {
                    return;
                }

                played++;


                const scoreFor =
                    teamIsA
                        ? individualMatch.scoreA
                        : individualMatch.scoreB;

                const scoreAgainst =
                    teamIsA
                        ? individualMatch.scoreB
                        : individualMatch.scoreA;

const discipline =
    individualMatch.discipline || tr("common.unknown", "Onbekend");

if (!disciplineStats[discipline]) {

    disciplineStats[discipline] = {
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0
    };

}

disciplineStats[discipline].played++;

if (scoreFor > scoreAgainst) {

    disciplineStats[discipline].wins++;

} else if (scoreFor < scoreAgainst) {

    disciplineStats[discipline].losses++;

} else {

    disciplineStats[discipline].draws++;

}

                if (scoreFor > scoreAgainst) {
                    wins++;
                } else if (scoreFor < scoreAgainst) {
                    losses++;
                } else {
                    draws++;
                }

            });

        });


        const winPercentage =
            played > 0
                ? Math.round((wins / played) * 100)
                : 0;

                const disciplineHTML =
    Object.entries(disciplineStats)
        .map(([discipline, stats]) => {

            let ballNumber = "";

const disciplineName = discipline.toLowerCase();

if (disciplineName.includes("8")) {
    ballNumber = "8";
} else if (disciplineName.includes("9")) {
    ballNumber = "9";
} else if (disciplineName.includes("10")) {
    ballNumber = "10";
} else if (
    disciplineName.includes("straight") ||
    disciplineName.includes("14.1")
) {
    ballNumber = "14";
}

            const percentage =
                stats.played > 0
                    ? Math.round(
                        (stats.wins / stats.played) * 100
                    )
                    : 0;

            return `

               <div class="player-discipline-card">

    ${ballNumber ? `
        <div class="discipline-ball discipline-ball-${ballNumber}">
            <span>${ballNumber}</span>
        </div>
    ` : ""}

    <div class="player-discipline-name">
        ${discipline}
    </div>

                    <div class="player-discipline-info">
                        ${stats.played} ${tr("common.playedLower", "gespeeld")} ·
                        ${stats.wins} gewonnen ·
                        <strong>${percentage}%</strong>
                    </div>

                </div>

            `;

        })
        .join("");


        statsContainer.innerHTML = `

        ${playerDetailSource === "mvp" && currentMvpPercentage ? `
    <div class="player-stat-card">
    <span>MVP-score</span>
    <strong>${currentMvpPercentage}</strong>
    <div class="player-stat-icon">🏅</div>
</div>

` : ""}    
        
        <div class="player-stat-card">
    <span>${tr("common.played", "Gespeeld")}</span>
    <strong>${played}</strong>
    <div class="player-stat-icon">📋</div>
</div>

            <div class="player-stat-card">
    <span>Gewonnen</span>
    <strong>${wins}</strong>
    <div class="player-stat-icon">🏆</div>
</div>

            <div class="player-stat-card">
    <span>Verloren</span>
    <strong>${losses}</strong>
    <div class="player-stat-icon">❌</div>
</div>

            <div class="player-stat-card">
    <span>${tr("common.drawShort", "Gelijk")}</span>
    <strong>${draws}</strong>
    <div class="player-stat-icon">🤝</div>
</div>

            <div class="player-stat-card">
    <span>${tr("player.winPercentage", "Winstpercentage")}</span>
    <strong>${winPercentage}%</strong>
    <div class="player-stat-icon">📈</div>
</div>

            <div class="player-discipline-section">

    <div class="competition-title">
        ${tr("player.perDiscipline", "Per discipline")}
    </div>

    ${disciplineHTML}

</div>

        `;


    } catch (error) {

        console.error(
            "Spelerstatistieken laden mislukt:",
            error
        );

        statsContainer.innerHTML =
            `<p>${tr("player.statsLoadFailed", "Statistieken konden niet geladen worden.")}</p>`;

    }

}

async function openMvpPlayerDetail(playerName, teamName, mvpPercentage) {

    currentMvpPercentage = mvpPercentage;

    console.log("MVP speler:", {
        playerName,
        teamName,
        mvpPercentage
    });

    const team = currentCompetitionData?.standings?.["1"]?.find(
    item =>
        item.player?.name?.trim().toLowerCase() ===
        teamName.trim().toLowerCase()
);

console.log("MVP TEAM GEVONDEN:", team);

if (!team?.player?.teamId) {
    console.error("Geen teamId gevonden voor MVP-speler:", playerName);
    return;
}

playerDetailSource = "mvp";
openPlayerDetail(playerName, team.player.teamId);

}

/* ===========================
   CLOSE PLAYER DETAIL
=========================== */

function closePlayerDetail() {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    if (playerDetailSource === "playerSearch") {

        document
            .getElementById("playerSearchScreen")
            .classList.add("active");

    } else if (
        playerDetailSource === "mvp" ||
        playerDetailSource === "tournament"
    ) {

        document
            .getElementById("competitionDetailScreen")
            .classList.add("active");

    } else {

        document
            .getElementById("teamDetailScreen")
            .classList.add("active");

    }
}

function openLiveScores() {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("liveScoresScreen")
        .classList.add("active");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function closeLiveScores() {

    if (liveScoresRefreshTimer) {
        clearInterval(liveScoresRefreshTimer);
        liveScoresRefreshTimer = null;
    }

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("homeScreen")
        .classList.add("active");
}

/* ===========================
   BAL ENZO LIVE SCORES
=========================== */

const balEnzoTables = [
    { id: 1280980, name: "1" },
    { id: 1280983, name: "2" },
    { id: 1280984, name: "3" },
    { id: 1280985, name: "4" },
    { id: 1280989, name: "5" },
    { id: 1280990, name: "6" },
    { id: 7982044, name: "7" },
    { id: 7982046, name: "8" },
    { id: 49084792, name: "9" },
    { id: 49084987, name: "10" }
];

let liveScoresSocket = null;
let liveScoresData = {};
let liveScoresRefreshTimer = null;


/* ===========================
   LIVE SCORE KAARTEN
=========================== */

function renderLiveTables() {

    const container =
        document.getElementById("liveTablesGrid");

    if (!container) return;

    container.innerHTML = balEnzoTables.map(table => {

        const match = liveScoresData[table.id];

        if (!match) {

            return `
                <div class="live-table-card live-table-free">

                    <div class="live-table-header">
                        <span>${tr("live.table", "TAFEL")} ${table.name}</span>
                        <span class="live-table-dot"></span>
                    </div>

                    <div class="live-table-free-text">
                        Vrij
                    </div>

                </div>
            `;
        }

        return `
            <div class="live-table-card live-table-active">

                <div class="live-table-header">
                    <span>${tr("live.table", "TAFEL")} ${table.name}</span>
                    <span class="live-table-live">LIVE</span>
                </div>

                <div class="live-table-match">

                    <div class="live-player">
                        ${match.playerA || tr("live.player1", "Speler 1")}
                    </div>

                   <div class="live-score-wrap">

    <div class="live-score">
        <span>${match.scoreA ?? 0}</span>
        <span class="live-score-dash">-</span>
        <span>${match.scoreB ?? 0}</span>
    </div>

    <div class="live-race-to">
        RT ${match.raceTo ?? "-"}
    </div>

</div>

                    <div class="live-player">
                        ${match.playerB || tr("live.player2", "Speler 2")}
                    </div>

                </div>

            </div>
        `;

    }).join("");
}


/* ===========================
   TAFELS OPHALEN
=========================== */

async function loadBalEnzoTables() {

    const status =
        document.getElementById("liveScoresStatus");

    if (status) {
        status.textContent =
            tr("live.loading", "Live gegevens laden...");
    }

    renderLiveTables();
}

const balEnzoCueScoreEvents = [];

async function loadCueScoreActiveMatches() {

    try {

        const today = new Date().toISOString().slice(0, 10);

        const eventsResponse = await fetch(
            `https://api.cuescore.com/venue/events/?venueId=1280972&date=${today}`
        );

        const eventsData = await eventsResponse.json();

        const eventIds = eventsData.events || [];

        balEnzoCueScoreEvents.splice(
            0,
            balEnzoCueScoreEvents.length,
            ...eventIds
        );

        const currentLiveScores = {};

        for (const tournamentId of eventIds) {

            const response = await fetch(
                `https://api.cuescore.com/tournament/?lang=en&id=${tournamentId}`
            );

            const data = await response.json();

            const matches =
                Array.isArray(data.matches)
                    ? data.matches
                    : [];

            const activeMatches = matches.filter(
                match => Number(match.matchstatusCode) === 1
            );

            for (const match of activeMatches) {

                /*
                 * Eerst proberen of dit een gewone
                 * live wedstrijd met rechtstreekse tafel is.
                 */
                const directTableId =
                    Number(match.table?.tableId);

                if (directTableId) {

                    currentLiveScores[directTableId] = {
                        matchId: match.matchId,
                        raceTo: match.raceTo,
                        playerA: match.playerA?.name || "",
                        playerB: match.playerB?.name || "",
                        scoreA: match.scoreA ?? 0,
                        scoreB: match.scoreB ?? 0
                    };

                    continue;
                }

                /*
                 * Teamwedstrijd:
                 * individuele wedstrijden ophalen via Worker.
                 */
                try {

                    const workerResponse = await fetch(
                        `https://balenzo-cuescore.nicolasmintjens.workers.dev/?tournamentId=${tournamentId}&matchId=${match.matchId}`
                    );

                    if (!workerResponse.ok) {
                        continue;
                    }

                    const workerData =
                        await workerResponse.json();

                    const individualMatches =
                        Array.isArray(workerData.matches)
                            ? workerData.matches
                            : [];

                    /*
                     * Per tafel nemen we de meest recent
                     * gestarte individuele wedstrijd.
                     */
                    const latestPerTable = {};

                    individualMatches.forEach(individualMatch => {

    const raceTo =
        Number(individualMatch.raceTo);

    const scoreA =
        Number(individualMatch.scoreA);

    const scoreB =
        Number(individualMatch.scoreB);

    const isFinished =
        Number.isFinite(raceTo) &&
        raceTo > 0 &&
        (
            scoreA >= raceTo ||
            scoreB >= raceTo
        );

    if (isFinished) {
        return;
    }

    const tableText =
        String(individualMatch.table || "");

    const tableMatch =
        tableText.match(/Table\s+(\d+)\s+BEB&D/i);

                        if (!tableMatch) {
                            return;
                        }

                        const tableNumber =
    String(Number(tableMatch[1]));

const balEnzoTable =
    balEnzoTables.find(
        table => String(table.name) === tableNumber
    );

if (!balEnzoTable) {
    return;
}

const tableId =
    balEnzoTable.id;

const startTime =
    individualMatch.startTime
        ? new Date(
            individualMatch.startTime
        ).getTime()
        : 0;

const existing =
    latestPerTable[tableId];

const existingStartTime =
    existing?.startTime
        ? new Date(
            existing.startTime
        ).getTime()
        : 0;

if (
    !existing ||
    startTime > existingStartTime
) {
    latestPerTable[tableId] =
        individualMatch;
}

                    });

                    Object.entries(
                        latestPerTable
                    ).forEach(
                        ([tableId, individualMatch]) => {

                            currentLiveScores[tableId] = {

                                matchId:
                                    individualMatch.matchId,

                                raceTo:
                                    individualMatch.raceTo,

                                playerA:
                                    individualMatch.playerA || "",

                                playerB:
                                    individualMatch.playerB || "",

                                scoreA:
                                    individualMatch.scoreA ?? 0,

                                scoreB:
                                    individualMatch.scoreB ?? 0

                            };

                        }
                    );

                } catch (workerError) {

                    console.warn(
                        "Individuele live wedstrijden laden mislukt:",
                        workerError
                    );

                }

            }

        }

        Object.keys(liveScoresData).forEach(tableId => {
            delete liveScoresData[tableId];
        });

        Object.assign(
    liveScoresData,
    currentLiveScores
);

renderLiveTables();

const status =
    document.getElementById("liveScoresStatus");

if (status) {
    status.textContent =
        tr("live.connected", "● Live gegevens actief");
}

} catch (error) {

        console.error(
            "❌ CueScore livegegevens laden mislukt:",
            error
        );

    }

}

/* ===========================
   CUESCORE WEBSOCKET
=========================== */

function connectCueScoreLive() {

    if (
    liveScoresSocket &&
    (
        liveScoresSocket.readyState === WebSocket.OPEN ||
        liveScoresSocket.readyState === WebSocket.CONNECTING
    )
) {
    return;
}

    try {

        liveScoresSocket =
            new WebSocket("wss://ws.cuescore.com:11443/");

        liveScoresSocket.addEventListener(
            "open",
            function () {

                console.log(
                    "🟢 CueScore WebSocket verbonden"
                );

                const status =
                    document.getElementById(
                        "liveScoresStatus"
                    );

                if (status) {
                    status.textContent =
                        tr("live.connected", "● Live verbinding actief");
                }

                /*
                 * Venue Bal Enzo
                 */
                liveScoresSocket.send(
    JSON.stringify({
        subscribeTo: [
    ...balEnzoCueScoreEvents,
    1280972
]
    })
);

            }
        );


        liveScoresSocket.addEventListener(
            "message",
            function (event) {

                console.log(
                    "📡 CueScore LIVE:",
                    event.data
                );

                processCueScoreLiveMessage(
                    event.data
                );

            }
        );

liveScoresSocket.addEventListener(
    "close",
    function () {

        console.log(
            "🔴 CueScore WebSocket gesloten"
        );

        liveScoresSocket = null;

        const status =
            document.getElementById(
                "liveScoresStatus"
            );

        if (status) {
            status.textContent =
                tr(
                    "live.disconnected",
                    "Live verbinding verbroken"
                );
        }

    }
);

        liveScoresSocket.addEventListener(
            "error",
            function (error) {

                console.warn(
                    "CueScore WebSocket fout:",
                    error
                );

            }
        );

    } catch (error) {

        console.error(
            "WebSocket kon niet worden gestart:",
            error
        );

    }

}


/* ===========================
   LIVE BERICHT VERWERKEN
=========================== */

function processCueScoreLiveMessage(message) {

    let data;

    try {

        data =
            typeof message === "string"
                ? JSON.parse(message)
                : message;

    } catch (error) {

        return;

    }

    console.log(
        "🔎 Live data:",
        data
    );

    /*
     * Voorlopig zoeken we automatisch
     * naar wedstrijdinformatie.
     */

    const possibleMatches = [];

    function scanObject(obj) {

        if (!obj || typeof obj !== "object") {
            return;
        }

        if (
    obj.table &&
    obj.table.tableId &&
    (
        obj.playerA ||
        obj.playerB ||
        obj.scoreA != null ||
        obj.scoreB != null
    )
) {

    possibleMatches.push(obj);

}

        Object.values(obj).forEach(value => {

            if (
                value &&
                typeof value === "object"
            ) {
                scanObject(value);
            }

        });

    }

    scanObject(data);


    possibleMatches.forEach(match => {

    const tableId =
        Number(match.table.tableId);

    if (!tableId) return;

    if (
    Number(match.matchstatusCode) !== 1 ||
    match.matchstatus !== "playing"
    ) {
        return;
    }

    Object.keys(liveScoresData).forEach(existingTableId => {

        const existingMatch =
            liveScoresData[existingTableId];

        if (
            existingMatch?.matchId === match.matchId &&
            Number(existingTableId) !== tableId
        ) {
            delete liveScoresData[existingTableId];
        }

    });

    liveScoresData[tableId] = {

        matchId:
            match.matchId,

        raceTo:
            match.raceTo,    

        playerA:
            typeof match.playerA === "object"
                ? match.playerA.name
                : match.playerA,

        playerB:
            typeof match.playerB === "object"
                ? match.playerB.name
                : match.playerB,

        scoreA:
            match.scoreA ?? 0,

        scoreB:
            match.scoreB ?? 0

    };

});

    renderLiveTables();

}


/* ===========================
   LIVE SCORES OPENEN
=========================== */

const originalOpenLiveScores =
    openLiveScores;

openLiveScores = async function () {

    originalOpenLiveScores();

    loadBalEnzoTables();
    await loadCueScoreActiveMatches();

    if (!liveScoresRefreshTimer) {
        liveScoresRefreshTimer = setInterval(
            loadCueScoreActiveMatches,
            15000
        );
    }

    connectCueScoreLive();

};

async function refreshLiveScores() {

    const status =
        document.getElementById("liveScoresStatus");

    if (status) {
        status.textContent =
            tr("live.loading", "Live gegevens laden...");
    }

    loadBalEnzoTables();
    await loadCueScoreActiveMatches();

    if (!liveScoresSocket ||
        liveScoresSocket.readyState !== WebSocket.OPEN) {
        connectCueScoreLive();
    }

}

/* ===========================
   TAFEL RESERVEREN
=========================== */

function openTableReservation() {

  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const screen =
    document.getElementById("tableReservationScreen");

  if (screen) {
    screen.classList.add("active");
  }

}


function closeTableReservation() {

  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const home =
    document.getElementById("homeScreen");

  if (home) {
    home.classList.add("active");
  }

}

function restartTableReservation() {
  const iframe =
    document.getElementById(
      "tableReservationIframe"
    );

  if (!iframe) return;

  iframe.src =
    "https://bal-enzo.sportsclubadmin.eu/reserveren";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ===========================
   ONZE CLUB
=========================== */

function openOurClub() {

  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const screen =
    document.getElementById("ourClubScreen");

  if (screen) {
    screen.classList.add("active");
  }

}

function closeOurClub() {

  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const home =
    document.getElementById("homeScreen");

  if (home) {
    home.classList.add("active");
  }

}

async function openMyProfile() {
  const profileUrl = localStorage.getItem("myProfileUrl");

  if (!profileUrl || !profileUrl.trim()) {
    openProfile();
    return;
  }

  const cleanUrl = profileUrl.trim().replace(/\/+$/, "");
  const playerIdMatch = cleanUrl.match(/\/(\d+)$/);

  if (!playerIdMatch) {
    alert(
      tr(
        "profile.invalidUrl",
        "De opgeslagen CueScore-profiel-link is niet geldig."
      )
    );
    return;
  }

  const playerId = playerIdMatch[1];

  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const screen = document.getElementById("myProfileScreen");

  if (screen) {
    screen.classList.add("active");
  }

  const loading =
    document.getElementById("myProfileLoading");

  const error =
    document.getElementById("myProfileError");

  const content =
    document.getElementById("myProfileContent");

  if (loading) {
    loading.style.display = "block";
    loading.textContent = "Profiel laden...";
  }

  if (error) {
    error.style.display = "none";
    error.textContent = "";
  }

  if (content) {
    content.style.display = "none";
  }

  try {
    /*
     * Alle requests starten onmiddellijk parallel.
     * We wachten eerst alleen op de basisgegevens van de speler,
     * zodat naam/foto/locatie zo snel mogelijk zichtbaar worden.
     */
    const participantRequest = fetch(
      `https://api.cuescore.com/participant/?id=${playerId}`
    );

    const ratingsRequest = fetch(
      `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileRatings&playerId=${playerId}`
    );

    const upcomingRequest = fetch(
      `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileUpcoming&playerId=${playerId}`
    );

    const tournamentsRequest = fetch(
      `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileTournaments&playerId=${playerId}`
    );

    const matchesRequest = fetch(
      `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileMatches&playerId=${playerId}&page=1`
    );

    const teamsRequest = fetch(
      `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileTeams&playerId=${playerId}`
    );

    const response = await participantRequest;

    if (!response.ok) {
      throw new Error(
        `CueScore antwoordde met status ${response.status}`
      );
    }

    const player = await response.json();

    if (!player || !player.playerId) {
      throw new Error(
        "Geen geldige spelergegevens ontvangen."
      );
    }

    const formatProfileMatchDate = value => {
      if (!value) return "";

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return value;
      }

      const datePart = date.toLocaleDateString("nl-BE", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });

      const timePart = date.toLocaleTimeString("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

      return `${datePart} · ${timePart}`;
    };

    /*
     * Eerst de basis van het profiel renderen.
     * Dit deel heeft alleen de participant-data nodig.
     */
    const image =
      document.getElementById("myProfileImage");

    const name =
      document.getElementById("myProfileName");

    const verified =
      document.getElementById("myProfileVerified");

    const location =
      document.getElementById("myProfileLocation");

    if (image) {
      if (player.image) {
        image.src = player.image;
        image.alt = player.name || "";
        image.style.display = "";
      } else {
        image.removeAttribute("src");
        image.alt = "";
        image.style.display = "none";
      }
    }

    if (name) {
      const playerName =
        player.name ||
        `${player.firstname || ""} ${player.lastname || ""}`.trim();

      linkedProfilePlayerNameCache = playerName;

      name.innerHTML = `
        <span>${playerName}</span>

        ${
          player.country?.image
            ? `
              <img
                class="my-profile-name-flag"
                src="${player.country.image}"
                alt="${player.country.name || ""}"
              >
            `
            : ""
        }
      `;
    }

    if (verified) {
      verified.style.display =
        player.badge === "claimed"
          ? ""
          : "none";
    }

    if (location) {
      const locationParts = [];

      if (player.livesIn?.city) {
        locationParts.push(player.livesIn.city);
      }

      if (player.livesIn?.country) {
        locationParts.push(player.livesIn.country);
      } else if (player.country?.name) {
        locationParts.push(player.country.name);
      }

      location.textContent =
        locationParts.join(", ");
    }

    if (loading) {
      loading.style.display = "none";
    }

    if (content) {
      content.style.display = "block";
    }

    /*
     * Nu pas wachten op de vier Worker-responses.
     * De basis van het profiel staat ondertussen al op het scherm.
     */
    const [
      ratingsResponse,
      upcomingResponse,
      tournamentsResponse,
      matchesResponse,
      teamsResponse
    ] = await Promise.all([
      ratingsRequest,
      upcomingRequest,
      tournamentsRequest,
      matchesRequest,
      teamsRequest
    ]);

    if (!ratingsResponse.ok) {
      throw new Error(
        `Profielratings konden niet geladen worden (${ratingsResponse.status}).`
      );
    }

    if (!upcomingResponse.ok) {
      throw new Error(
        `Geplande profielwedstrijden konden niet geladen worden (${upcomingResponse.status}).`
      );
    }

    if (!tournamentsResponse.ok) {
      throw new Error(
        `Profieltornooien konden niet geladen worden (${tournamentsResponse.status}).`
      );
    }

    if (!matchesResponse.ok) {
      throw new Error(
        `Profielwedstrijden konden niet geladen worden (${matchesResponse.status}).`
      );
    }

    if (!teamsResponse.ok) {
      throw new Error(
        `Profielteams konden niet geladen worden (${teamsResponse.status}).`
      );
    }

    const [
      ratingsData,
      upcomingData,
      tournamentsData,
      matchesData,
      teamsData
    ] = await Promise.all([
      ratingsResponse.json(),
      upcomingResponse.json(),
      tournamentsResponse.json(),
      matchesResponse.json(),
      teamsResponse.json()
    ]);

    if (
      !ratingsData.success ||
      !Array.isArray(ratingsData.ratings)
    ) {
      throw new Error(
        "Geen geldige profielratings ontvangen."
      );
    }

    if (
      !upcomingData.success ||
      !Array.isArray(upcomingData.matches)
    ) {
      throw new Error(
        "Geen geldige geplande profielwedstrijden ontvangen."
      );
    }

    if (
      !tournamentsData.success ||
      !Array.isArray(tournamentsData.tournaments)
    ) {
      throw new Error(
        "Geen geldige profieltornooien ontvangen."
      );
    }

    if (
      !matchesData.success ||
      !Array.isArray(matchesData.matches)
    ) {
      throw new Error(
        "Geen geldige profielwedstrijden ontvangen."
      );
    }

    if (
      !teamsData.success ||
      !Array.isArray(teamsData.teams)
    ) {
      throw new Error(
        "Geen geldige profielteams ontvangen."
      );
    }

    /*
     * Worker-afhankelijke inhoud renderen.
     */
    const tournamentsPanel =
      document.getElementById("myProfileTabTournaments");

    if (tournamentsPanel) {
      const tournaments = tournamentsData.tournaments;

      tournamentsPanel.innerHTML = `
        ${
          tournaments.length
            ? tournaments.map(tournament => `
                <div
                  class="my-profile-tournament-card"
                  onclick="openProfileTournament('${tournament.tournamentId}')"
                >
                  <div class="my-profile-tournament-date">
                    ${tournament.date || ""}
                  </div>

                  <div class="my-profile-tournament-name">
                    ${tournament.name || ""}
                  </div>

                  <div class="my-profile-tournament-organizer">
                    ${tournament.organizer || ""}
                  </div>

                  <div class="my-profile-tournament-details">
                    ${
                      tournament.position
                        ? `<span>🏆 ${tournament.position}</span>`
                        : tournament.status === "upcoming"
                          ? `<span>Gepland</span>`
                          : tournament.status === "live"
                            ? `<span>Bezig</span>`
                            : ""
                    }

                    ${
                      tournament.participants
                        ? `<span>👤 ${tournament.participants} deelnemers</span>`
                        : ""
                    }
                  </div>
                </div>
              `).join("")
            : `
                <div class="my-profile-empty">
                  Geen tornooien gevonden.
                </div>
              `
        }
      `;
    }

    const matchesPanel =
      document.getElementById("myProfileTabMatches");

    if (matchesPanel) {
      const upcomingMatches =
        upcomingData.matches;

      const playedMatches =
        matchesData.matches;

      matchesPanel.innerHTML = `
        <div class="my-profile-match-tabs">
          <button
            type="button"
            class="my-profile-match-tab active"
            data-match-tab="upcoming"
          >
            Gepland (${upcomingMatches.length})
          </button>

          <button
            type="button"
            class="my-profile-match-tab"
            data-match-tab="played"
          >
            Gespeeld (${playedMatches.length})
          </button>
        </div>

        <div
          class="my-profile-matches-section"
          id="myProfileUpcomingSection"
        >
          <div id="myProfileUpcomingMatches">
            ${
              upcomingMatches.length
                ? upcomingMatches.map(match => `
                    <div class="my-profile-match-card">
                      <div class="my-profile-match-date">
                        ${formatProfileMatchDate(match.date)}
                      </div>

                      <div class="my-profile-match-opponent">
                        ${match.opponent || ""}
                      </div>

                      <div class="my-profile-match-info">
                        ${
                          match.matchNo
                            ? `Match ${match.matchNo}`
                            : ""
                        }
                      </div>
                    </div>
                  `).join("")
                : `
                    <div class="my-profile-empty">
                      Geen geplande wedstrijden.
                    </div>
                  `
            }
          </div>
        </div>

        <div
          class="my-profile-matches-section"
          id="myProfilePlayedSection"
          style="display: none;"
        >
          <div id="myProfilePlayedMatches">
            ${
              playedMatches.length
                ? playedMatches.map(match => `
                    <div
                      class="my-profile-match-card ${match.result === "win" ? "won" : match.result === "loss" ? "lost" : ""}"
                      onclick="openProfilePlayedMatch('${match.matchId}', '${match.tournamentId}')"
                    >
                      <div class="my-profile-match-date">
                        ${formatProfileMatchDate(match.date)}
                      </div>

                      <div class="my-profile-played-main">
                        <div class="my-profile-match-opponent">
                          ${match.opponent || ""}
                        </div>

                        <div class="my-profile-match-score">
                          ${match.scorePlayer} - ${match.scoreOpponent}
                        </div>
                      </div>

                      <div class="my-profile-match-tournament">
                        ${match.tournament || ""}
                      </div>

                    </div>
                  `).join("")
                : `
                    <div class="my-profile-empty">
                      Geen gespeelde wedstrijden.
                    </div>
                  `
            }
          </div>

          <button
            type="button"
            id="myProfileLoadMoreMatches"
            class="my-profile-load-more"
            data-player-id="${playerId}"
            data-next-page="2"
          >
            Meer wedstrijden laden
          </button>
        </div>
      `;
    }

    const teamsPanel =
      document.getElementById("myProfileTabTeams");

    if (teamsPanel) {
      const teams = teamsData.teams;

      teamsPanel.innerHTML = `
        ${
          teams.length
            ? teams.map(team => `
                <div
                  class="team-player-card"
                  onclick="openProfileTeam(
                    '${String(team.id || "").replace(/'/g, "\\'")}',
                    '${String(team.name || "Team").replace(/'/g, "\\'")}'
                  )"
                >
                  <span>${team.name || "Team"}</span>

                  <span class="team-player-arrow">
                    ›
                  </span>
                </div>
              `).join("")
            : `
                <div class="my-profile-empty">
                  Geen teams gevonden.
                </div>
              `
        }
      `;
    }

    const ratingsContainer =
      document.getElementById("myProfileRatings");

    if (ratingsContainer) {
      ratingsContainer.innerHTML = `
        ${
          ratingsData.ratings.length
            ? ratingsData.ratings.map(rating => `
                <div class="my-profile-rating">
                  <div class="my-profile-rating-value">
                    ${rating.value}
                  </div>

                  <div class="my-profile-rating-name">
                    ${
                      rating.name === "KNBB Pool Rating"
                        ? "🇳🇱 "
                        : rating.name === "P-B-B Pool Rating"
                          ? "🇧🇪 "
                          : ""
                    }
                    ${rating.name}
                  </div>
                </div>
              `).join("")
            : `
                <div class="my-profile-empty">
                  Geen ratings beschikbaar.
                </div>
              `
        }
      `;
    }

    const defaultProfileTab =
      document.querySelector(
        '.my-profile-tab[data-profile-tab="matches"]'
      );

    showMyProfileTab(
      "matches",
      defaultProfileTab
    );

  } catch (err) {
    console.error("CueScore-profiel laden mislukt:", err);

    if (loading) {
      loading.style.display = "none";
    }

    if (content) {
      content.style.display = "none";
    }

    if (error) {
      error.textContent =
        "Het CueScore-profiel kon niet geladen worden.";
      error.style.display = "block";
    }
  }
}

function showMyProfileTab(tabName, button) {
      if (tabName === "cuescore") {
    const profileUrl =
      localStorage.getItem("myProfileUrl");

    if (!profileUrl || !profileUrl.trim()) {
      alert(
        tr(
          "profile.noProfile",
          "Er is nog geen CueScore-profiel ingesteld."
        )
      );
      return;
    }

    const profileScreen =
      document.getElementById("myProfileScreen");

    const cueScoreScreen =
      document.getElementById("myProfileCueScoreScreen");

    const cueScoreIframe =
      document.getElementById("myProfileCueScoreIframe");

    if (cueScoreIframe) {
      cueScoreIframe.src = profileUrl.trim();
    }

    if (profileScreen) {
      profileScreen.classList.remove("active");
    }

    if (cueScoreScreen) {
      cueScoreScreen.classList.add("active");
    }

    return;
  }
  document.querySelectorAll(".my-profile-tab-panel").forEach(panel => {
    panel.style.display = "none";
  });

  document.querySelectorAll(".my-profile-tab").forEach(tab => {
    tab.classList.remove("active");
  });

  const panelId =
    "myProfileTab" +
    tabName.charAt(0).toUpperCase() +
    tabName.slice(1);

  const panel =
    document.getElementById(panelId);

  if (panel) {
    panel.style.display = "block";
  }

  if (button) {
    button.classList.add("active");
  }
}

function showMyProfileMatchTab(tabName, button) {
  const upcomingSection =
    document.getElementById("myProfileUpcomingSection");

  const playedSection =
    document.getElementById("myProfilePlayedSection");

  if (upcomingSection) {
    upcomingSection.style.display =
      tabName === "upcoming" ? "block" : "none";
  }

  if (playedSection) {
    playedSection.style.display =
      tabName === "played" ? "block" : "none";
  }

  document.querySelectorAll(".my-profile-match-tab").forEach(tab => {
    tab.classList.remove("active");
  });

  if (button) {
    button.classList.add("active");
  }
}

document.addEventListener("click", function (event) {
  const profileTab =
    event.target.closest(".my-profile-tab");

  if (!profileTab) {
    return;
  }

  const tabName =
    profileTab.dataset.profileTab;

  if (!tabName) {
    return;
  }

    showMyProfileTab(
    tabName,
    profileTab
  );
});

function closeMyProfileCueScore() {
  const cueScoreScreen =
    document.getElementById("myProfileCueScoreScreen");

  const profileScreen =
    document.getElementById("myProfileScreen");

  const cueScoreIframe =
    document.getElementById("myProfileCueScoreIframe");

  if (cueScoreIframe) {
    cueScoreIframe.src = "";
  }

  if (cueScoreScreen) {
    cueScoreScreen.classList.remove("active");
  }

  if (profileScreen) {
    profileScreen.classList.add("active");
  }
}

document.addEventListener("click", function (event) {
  const matchTab =
    event.target.closest(".my-profile-match-tab");

  if (!matchTab) {
    return;
  }

  const tabName =
    matchTab.dataset.matchTab;

  if (!tabName) {
    return;
  }

  showMyProfileMatchTab(
    tabName,
    matchTab
  );
});

async function loadMoreProfileMatches(button) {
  if (!button) return;

  const playerId = button.dataset.playerId;
  const page = Number(button.dataset.nextPage || 2);

  if (!playerId || !page) {
    return;
  }

  const matchesContainer =
    document.getElementById("myProfilePlayedMatches");

  if (!matchesContainer) {
    return;
  }

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Laden...";

  try {
    const response = await fetch(
      `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=profileMatches&playerId=${playerId}&page=${page}`
    );

    if (!response.ok) {
      throw new Error(
        `Profielwedstrijden konden niet geladen worden (${response.status}).`
      );
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.matches)) {
      throw new Error(
        "Geen geldige profielwedstrijden ontvangen."
      );
    }

    const formatDate = value => {
      if (!value) return "";

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return value;
      }

      const datePart = date.toLocaleDateString("nl-BE", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });

      const timePart = date.toLocaleTimeString("nl-BE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

      return `${datePart} · ${timePart}`;
    };

    data.matches.forEach(match => {
      const card = document.createElement("div");

            card.className =
        `my-profile-match-card ${
          match.result === "win"
            ? "won"
            : match.result === "loss"
              ? "lost"
              : ""
        }`;

      card.innerHTML = `
        <div class="my-profile-match-date">
          ${formatDate(match.date)}
        </div>

        <div class="my-profile-played-main">

          <div class="my-profile-match-opponent">
            ${match.opponent || ""}
          </div>

          <div class="my-profile-match-score">
            ${match.scorePlayer} - ${match.scoreOpponent}
          </div>

        </div>

        <div class="my-profile-match-tournament">
          ${match.tournament || ""}
        </div>
      `;

      matchesContainer.appendChild(card);
    });

    if (data.matches.length < 25) {
      button.remove();
      return;
    }

    button.dataset.nextPage =
      String(page + 1);

    button.disabled = false;
    button.textContent = originalText;

  } catch (err) {
    console.error(
      "Meer profielwedstrijden laden mislukt:",
      err
    );

    button.disabled = false;
    button.textContent =
      "Opnieuw proberen";
  }
}

document.addEventListener("click", function (event) {
  const loadMoreButton =
    event.target.closest("#myProfileLoadMoreMatches");

  if (!loadMoreButton) {
    return;
  }

  loadMoreProfileMatches(loadMoreButton);
});

function closeMyProfile() {
  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const home = document.getElementById("homeScreen");

  if (home) {
    home.classList.add("active");
  }
}

function selectReservationGame(gameType) {

    reservationSelectedGameType = gameType;
reservationSelectedDate = null;

const now = new Date();

reservationCalendarYear =
    now.getFullYear();

reservationCalendarMonth =
    now.getMonth();

    console.log("Gekozen discipline:", gameType);

    const gameStep = document.getElementById("reservationStepGame");
    const dateStep = document.getElementById("reservationStepDate");

    if (gameStep) {
        gameStep.style.display = "none";
    }

    if (dateStep) {
        dateStep.style.display = "block";
    }

    renderReservationCalendar(
    reservationCalendarYear,
    reservationCalendarMonth
);
}

function backToReservationGame() {

    const gameStep = document.getElementById("reservationStepGame");
    const dateStep = document.getElementById("reservationStepDate");

    if (dateStep) {
        dateStep.style.display = "none";
    }

    if (gameStep) {
        gameStep.style.display = "block";
    }
}

/* ===========================
   RESERVATIE KALENDER
=========================== */

let reservationCalendarYear = new Date().getFullYear();
let reservationCalendarMonth = new Date().getMonth();

let reservationSelectedGameType = null;
let reservationSelectedDate = null;


function renderReservationCalendar(year, month) {

    const calendar =
        document.getElementById("reservationCalendar");

    const monthLabel =
        document.getElementById("reservationCalendarMonth");

    if (!calendar || !monthLabel) return;


    const monthNames = [
        "Januari",
        "Februari",
        "Maart",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Augustus",
        "September",
        "Oktober",
        "November",
        "December"
    ];


    monthLabel.textContent =
        `${monthNames[month]} ${year}`;


    const firstDay =
        new Date(year, month, 1);

    const daysInMonth =
        new Date(year, month + 1, 0).getDate();


    // Zondag = 0 in JavaScript.
    // Wij willen maandag als eerste dag.
    const startDay =
        (firstDay.getDay() + 6) % 7;


    const today = new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    let html = `

        <div class="reservation-calendar-weekdays">

            <span>MA</span>
            <span>DI</span>
            <span>WO</span>
            <span>DO</span>
            <span>VR</span>
            <span>ZA</span>
            <span>ZO</span>

        </div>


        <div class="reservation-calendar-days">

    `;


    // Lege vakken vóór de eerste dag van de maand
    for (let i = 0; i < startDay; i++) {

        html += `
            <span class="reservation-calendar-empty"></span>
        `;

    }


    // Kalenderdagen
    for (let day = 1; day <= daysInMonth; day++) {

        const dayDate =
            new Date(year, month, day);

        dayDate.setHours(
            0,
            0,
            0,
            0
        );


        const dateValue =
            `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;


        const isPast =
            dayDate < today;

        const isToday =
            dayDate.getTime() === today.getTime();

        const isSelected =
            reservationSelectedDate === dateValue;


        let className =
            "reservation-calendar-day";

        if (isPast) {
            className += " disabled";
        }

        if (isToday) {
            className += " today";
        }

        if (isSelected) {
            className += " selected";
        }


        html += `

            <button
                class="${className}"
                type="button"
                ${isPast ? "disabled" : ""}
                onclick="selectReservationDate('${dateValue}', this)">
                ${day}
            </button>

        `;

    }


    html += `

        </div>


        <button
            class="reservation-next-button"
            id="reservationDateNextButton"
            type="button"
            ${reservationSelectedDate ? "" : "disabled"}
            onclick="continueReservationDate()">

            ${tr("common.next", "Volgende")}

        </button>

    `;


    calendar.innerHTML = html;


    updateReservationMonthButtons();

}


function changeReservationMonth(offset) {

    const newDate =
        new Date(
            reservationCalendarYear,
            reservationCalendarMonth + offset,
            1
        );


    const currentMonth =
        new Date();

    currentMonth.setDate(1);

    currentMonth.setHours(
        0,
        0,
        0,
        0
    );


    // Niet naar maanden in het verleden
    if (newDate < currentMonth) {
        return;
    }


    reservationCalendarYear =
        newDate.getFullYear();

    reservationCalendarMonth =
        newDate.getMonth();


    renderReservationCalendar(
        reservationCalendarYear,
        reservationCalendarMonth
    );

}


function updateReservationMonthButtons() {

    const buttons =
        document.querySelectorAll(
            ".reservation-calendar-nav button"
        );

    if (buttons.length < 2) return;


    const previousButton =
        buttons[0];


    const now =
        new Date();

    const isCurrentMonth =
        reservationCalendarYear === now.getFullYear() &&
        reservationCalendarMonth === now.getMonth();


    previousButton.disabled =
        isCurrentMonth;

}


function selectReservationDate(date, button) {

    reservationSelectedDate =
        date;


    document
        .querySelectorAll(".reservation-calendar-day")
        .forEach(dayButton => {

            dayButton.classList.remove("selected");

        });


    if (button) {
        button.classList.add("selected");
    }


    const nextButton =
        document.getElementById(
            "reservationDateNextButton"
        );


    if (nextButton) {
        nextButton.disabled = false;
    }


    console.log(
        "Gekozen datum:",
        reservationSelectedDate
    );

}


function continueReservationDate() {

    if (!reservationSelectedDate) {
        return;
    }


    console.log(
        "Verder met reservatie:",
        {
            gameType: reservationSelectedGameType,
            date: reservationSelectedDate
        }
    );


    // Hier koppelen we straks stap 3:
    // beschikbare starturen

}   

/* ===========================
   RESERVATIE UUR & DUUR
=========================== */

let reservationSelectedTime = null;
let reservationSelectedDuration = null;


function continueReservationDate() {

    if (!reservationSelectedDate) {
        return;
    }

    const dateStep =
        document.getElementById("reservationStepDate");

    const timeStep =
        document.getElementById("reservationStepTime");

    if (dateStep) {
        dateStep.style.display = "none";
    }

    if (timeStep) {
        timeStep.style.display = "block";
    }


    reservationSelectedTime = null;
    reservationSelectedDuration = null;


    const dateText =
        document.getElementById("reservationSelectedDateText");

    if (dateText) {

        const parts =
            reservationSelectedDate.split("-");

        const formattedDate =
            `${parts[2]}/${parts[1]}/${parts[0]}`;

        dateText.textContent =
            `${tr("reservation.selectedDate", "Gekozen datum")}: ${formattedDate}`;
    }


    renderReservationTestTimes();
}


function renderReservationTestTimes() {

    const container =
        document.getElementById("reservationTimeGrid");

    if (!container) return;


    /*
     * Tijdelijke testuren.
     * Deze vervangen we later door de echte
     * SportsClubAdmin beschikbaarheid.
     */
    const times = [
        "13:00",
        "13:30",
        "14:00",
        "14:30",
        "15:00",
        "15:30",
        "16:00",
        "16:30",
        "17:00",
        "17:30",
        "18:00",
        "18:30",
        "19:00",
        "19:30",
        "20:00",
        "20:30"
    ];


    container.innerHTML =
        times.map(time => `

            <button
                class="reservation-time-button"
                type="button"
                onclick="selectReservationTime('${time}', this)">
                ${time}
            </button>

        `).join("");


    const durationSection =
        document.getElementById("reservationDurationSection");

    if (durationSection) {
        durationSection.style.display = "none";
    }


    const nextButton =
        document.getElementById("reservationTimeNextButton");

    if (nextButton) {
        nextButton.disabled = true;
    }
}


function selectReservationTime(time, button) {

    reservationSelectedTime =
        time;

    reservationSelectedDuration =
        null;


    document
        .querySelectorAll(".reservation-time-button")
        .forEach(timeButton => {

            timeButton.classList.remove("selected");

        });


    button.classList.add("selected");


    renderReservationDurations();
}


function renderReservationDurations() {

    const section =
        document.getElementById("reservationDurationSection");

    const container =
        document.getElementById("reservationDurationGrid");

    if (!section || !container) return;


    section.style.display =
        "block";


    /*
     * Tijdelijke testduren.
     * Later komen deze rechtstreeks uit
     * available_durations van SportsClubAdmin.
     */
    const durations = [
        { minutes: 60, label: tr("reservation.oneHour", "1 uur") },
        { minutes: 90, label: "1u30" },
        { minutes: 120, label: tr("reservation.twoHours", "2 uur") },
        { minutes: 150, label: "2u30" },
        { minutes: 180, label: tr("reservation.threeHours", "3 uur") }
    ];


    container.innerHTML =
        durations.map(duration => `

            <button
                class="reservation-duration-button"
                type="button"
                onclick="selectReservationDuration(${duration.minutes}, this)">
                ${duration.label}
            </button>

        `).join("");


    const nextButton =
        document.getElementById("reservationTimeNextButton");

    if (nextButton) {
        nextButton.disabled = true;
    }
}


function selectReservationDuration(duration, button) {

    reservationSelectedDuration =
        duration;


    document
        .querySelectorAll(".reservation-duration-button")
        .forEach(durationButton => {

            durationButton.classList.remove("selected");

        });


    button.classList.add("selected");


    const nextButton =
        document.getElementById("reservationTimeNextButton");

    if (nextButton) {
        nextButton.disabled = false;
    }
}


function backToReservationDate() {

    const timeStep =
        document.getElementById("reservationStepTime");

    const dateStep =
        document.getElementById("reservationStepDate");

    if (timeStep) {
        timeStep.style.display = "none";
    }

    if (dateStep) {
        dateStep.style.display = "block";
    }
}


function continueReservationTime() {

    if (
        !reservationSelectedTime ||
        !reservationSelectedDuration
    ) {
        return;
    }

    const timeStep =
        document.getElementById("reservationStepTime");

    const customerStep =
        document.getElementById("reservationStepCustomer");

    if (timeStep) {
        timeStep.style.display = "none";
    }

    if (customerStep) {
        customerStep.style.display = "block";
    }

    renderReservationSummary();
}

function backToReservationTime() {

    const customerStep =
        document.getElementById("reservationStepCustomer");

    const timeStep =
        document.getElementById("reservationStepTime");

    if (customerStep) {
        customerStep.style.display = "none";
    }

    if (timeStep) {
        timeStep.style.display = "block";
    }
}


function renderReservationSummary() {

    const container =
        document.getElementById("reservationSummaryCard");

    if (!container) return;

    const dateParts =
        reservationSelectedDate.split("-");

    const formattedDate =
        `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    const gameLabel =
        reservationSelectedGameType === "snooker"
            ? "Snooker"
            : "Pool";

    const durationLabel =
        formatReservationDuration(
            reservationSelectedDuration
        );

    container.innerHTML = `
        <div class="reservation-summary-row">
            <span>${tr("common.discipline", "Discipline")}</span>
            <strong>${gameLabel}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>${tr("common.date", "Datum")}</span>
            <strong>${formattedDate}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>${tr("reservation.startTime", "Startuur")}</span>
            <strong>${reservationSelectedTime}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>${tr("reservation.duration", "Speelduur")}</span>
            <strong>${durationLabel}</strong>
        </div>
    `;
}


function formatReservationDuration(minutes) {

    const hours =
        Math.floor(minutes / 60);

    const remainingMinutes =
        minutes % 60;

    if (hours && remainingMinutes) {
        return `${hours}u${remainingMinutes}`;
    }

    if (hours) {
        return `${hours} ${tr("reservation.hours", "uur")}`;
    }

    return `${remainingMinutes} min`;
}


function continueReservationCustomer() {

    const name =
        document
            .getElementById("reservationCustomerName")
            .value
            .trim();

    const email =
        document
            .getElementById("reservationCustomerEmail")
            .value
            .trim();

    const phone =
        document
            .getElementById("reservationCustomerPhone")
            .value
            .trim();

    const comments =
        document
            .getElementById("reservationCustomerComments")
            .value
            .trim();

    if (!name) {
        alert("Vul je naam in.");
        return;
    }

    if (!email) {
        alert("Vul je e-mailadres in.");
        return;
    }

    if (!phone) {
        alert("Vul je telefoonnummer in.");
        return;
    }

    const customerStep =
        document.getElementById("reservationStepCustomer");

    const confirmStep =
        document.getElementById("reservationStepConfirm");

    if (customerStep) {
        customerStep.style.display = "none";
    }

    if (confirmStep) {
        confirmStep.style.display = "block";
    }

    renderReservationFinalSummary(
        name,
        email,
        phone,
        comments
    );
}


function renderReservationFinalSummary(
    name,
    email,
    phone,
    comments
) {

    const container =
        document.getElementById("reservationFinalSummary");

    if (!container) return;

    const dateParts =
        reservationSelectedDate.split("-");

    const formattedDate =
        `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    const gameLabel =
        reservationSelectedGameType === "snooker"
            ? "Snooker"
            : "Pool";

    container.innerHTML = `

        <div class="reservation-summary-row">
            <span>${tr("common.discipline", "Discipline")}</span>
            <strong>${gameLabel}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>${tr("common.date", "Datum")}</span>
            <strong>${formattedDate}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>${tr("reservation.startTime", "Startuur")}</span>
            <strong>${reservationSelectedTime}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>${tr("reservation.duration", "Speelduur")}</span>
            <strong>${formatReservationDuration(reservationSelectedDuration)}</strong>
        </div>

        <div class="reservation-summary-divider"></div>

        <div class="reservation-summary-row">
            <span>Naam</span>
            <strong>${name}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>E-mail</span>
            <strong>${email}</strong>
        </div>

        <div class="reservation-summary-row">
            <span>Telefoon</span>
            <strong>${phone}</strong>
        </div>

        ${
            comments
                ? `
                    <div class="reservation-summary-row reservation-summary-comments">
                        <span>Opmerking</span>
                        <strong>${comments}</strong>
                    </div>
                `
                : ""
        }

    `;
}


function backToReservationCustomer() {

    const confirmStep =
        document.getElementById("reservationStepConfirm");

    const customerStep =
        document.getElementById("reservationStepCustomer");

    if (confirmStep) {
        confirmStep.style.display = "none";
    }

    if (customerStep) {
        customerStep.style.display = "block";
    }
}


function submitReservation() {

    console.log(
        "Reservatie klaar voor verzending:",
        {
            game_type:
                reservationSelectedGameType,

            date:
                reservationSelectedDate,

            start_time:
                reservationSelectedTime,

            duration:
                reservationSelectedDuration,

            customer_name:
                document.getElementById("reservationCustomerName").value.trim(),

            customer_email:
                document.getElementById("reservationCustomerEmail").value.trim(),

            customer_phone:
                document.getElementById("reservationCustomerPhone").value.trim(),

            comments:
                document.getElementById("reservationCustomerComments").value.trim()
        }
    );

    alert(
        tr("reservation.testSuccess", "Test geslaagd. De reservatie wordt nog niet echt verstuurd.")
    );
}

function showMoneygamesHelp() {
  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const helpScreen =
    document.getElementById("moneygamesHelpScreen");

  if (helpScreen) {
    helpScreen.classList.add("active");
  }

  window.scrollTo(0, 0);
}

function showMoneygamesHelpIfNeeded() {
  const hasSeenHelp =
    localStorage.getItem("moneygamesHelpSeen");

  if (hasSeenHelp === "true") {
    return;
  }

  localStorage.setItem(
    "moneygamesHelpSeen",
    "true"
  );

  showMoneygamesHelp();
}

function closeMoneygamesHelp() {
  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const moneygamesScreen =
    document.getElementById("moneygamesScreen");

  if (moneygamesScreen) {
    moneygamesScreen.classList.add("active");
  }

  window.scrollTo(0, 0);
}

async function openMoneygames() {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  document.getElementById("moneygamesScreen").classList.add("active");
  window.scrollTo(0, 0);

  showMoneygamesHelpIfNeeded();

  const user = await getCurrentUser();

  if (user) {
    const now =
  new Date().toISOString();

const storageKey =
  `moneygamesLastSeenOpen_${user.id}`;

const personalStorageKey =
  `moneygamesLastSeenPersonal_${user.id}`;

localStorage.setItem(
  storageKey,
  now
);

localStorage.setItem(
  personalStorageKey,
  now
);

    await markSelectedMoneygameReactionsAsSeen(user);

await updateMoneygamesNotificationBadge();

showOpenMoneygames();
  }
}

function closeMoneygames() {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  document.getElementById("homeScreen").classList.add("active");
  window.scrollTo(0, 0);
}

/*
 * Mijn Matches rechtstreeks openen vanuit een pushmelding.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const currentUrl = new URL(window.location.href);

  if (
    currentUrl.searchParams.get("open") !==
    "moneygames"
  ) {
    return;
  }

  /*
   * Parameter verwijderen zodat Mijn Matches niet opnieuw
   * opent wanneer de gebruiker de app later vernieuwt.
   */
  currentUrl.searchParams.delete("open");

  window.history.replaceState(
    {},
    document.title,
    currentUrl.pathname +
      currentUrl.search +
      currentUrl.hash
  );

  await openMoneygames();
  showMyMoneygames();
});

/* =========================================================
   START2POOL LEVEL TABS
========================================================= */

document.querySelectorAll(".start2pool-level-tab").forEach(button => {
    button.addEventListener("click", () => {

        const level = button.dataset.level;

        // Actieve tab verwijderen
        document.querySelectorAll(".start2pool-level-tab").forEach(tab => {
            tab.classList.remove("active");
        });

        // Geklikte tab actief maken
        button.classList.add("active");

        // Alle level-inhoud verbergen
        document.querySelectorAll(".start2pool-level-content").forEach(content => {
            content.classList.remove("active");
        });

        // Juiste level tonen
        const selectedLevel =
            document.getElementById(
                `start2PoolLevel${level.toUpperCase()}`
            );

        if (selectedLevel) {
            selectedLevel.classList.add("active");
        }
    });
});

/* =========================================================
   START2POOL EXERCISE NAVIGATION
========================================================= */

function openStart2PoolExercise() {

    document
        .querySelectorAll(".screen")
        .forEach(screen => screen.classList.remove("active"));

    document
        .getElementById("start2PoolExerciseScreen")
        .classList.add("active");

    window.scrollTo(0, 0);
}


function closeStart2PoolExercise() {

    document
        .querySelectorAll(".screen")
        .forEach(screen => screen.classList.remove("active"));

    document
        .getElementById("start2PoolScreen")
        .classList.add("active");

    window.scrollTo(0, 0);
}

/* =========================================================
   START2POOL FOTO VIEWER
========================================================= */

const start2PoolImageViewer =
  document.getElementById("start2PoolImageViewer");

const start2PoolImageViewerImage =
  document.getElementById("start2PoolImageViewerImage");

let start2PoolImageScale = 1;
let start2PoolImageTranslateX = 0;
let start2PoolImageTranslateY = 0;

let start2PoolImagePointers = new Map();

let start2PoolImageStartDistance = 0;
let start2PoolImageStartScale = 1;

let start2PoolImagePanStartX = 0;
let start2PoolImagePanStartY = 0;
let start2PoolImagePanTranslateX = 0;
let start2PoolImagePanTranslateY = 0;

let start2PoolImageMoved = false;

function applyStart2PoolImageTransform() {
  if (!start2PoolImageViewerImage) return;

  if (start2PoolImageScale <= 1) {
    start2PoolImageScale = 1;
    start2PoolImageTranslateX = 0;
    start2PoolImageTranslateY = 0;

    start2PoolImageViewerImage.classList.remove("zoomed");
  } else {
    start2PoolImageViewerImage.classList.add("zoomed");
  }

  start2PoolImageViewerImage.style.transform =
    `translate3d(
      ${start2PoolImageTranslateX}px,
      ${start2PoolImageTranslateY}px,
      0
    ) scale(${start2PoolImageScale})`;
}

function resetStart2PoolImageZoom() {
  start2PoolImageScale = 1;
  start2PoolImageTranslateX = 0;
  start2PoolImageTranslateY = 0;

  start2PoolImagePointers.clear();

  applyStart2PoolImageTransform();
}

function openStart2PoolImage(image) {
  if (
    !start2PoolImageViewer ||
    !start2PoolImageViewerImage ||
    !image
  ) {
    return;
  }

  start2PoolImageViewerImage.src =
    image.currentSrc || image.src;

  start2PoolImageViewerImage.alt =
    image.alt || "Start2Pool oefening";

  resetStart2PoolImageZoom();

  start2PoolImageViewer.classList.add("open");
  start2PoolImageViewer.setAttribute("aria-hidden", "false");

  document.body.classList.add("start2pool-viewer-open");
}

function closeStart2PoolImage() {
  if (
    !start2PoolImageViewer ||
    !start2PoolImageViewerImage
  ) {
    return;
  }

  start2PoolImageViewer.classList.remove("open");
  start2PoolImageViewer.setAttribute("aria-hidden", "true");

  document.body.classList.remove("start2pool-viewer-open");

  resetStart2PoolImageZoom();

  start2PoolImageViewerImage.src = "";
  start2PoolImageViewerImage.alt = "";
}

function getStart2PoolPointerDistance() {
  const points = Array.from(
    start2PoolImagePointers.values()
  );

  if (points.length < 2) return 0;

  return Math.hypot(
    points[1].x - points[0].x,
    points[1].y - points[0].y
  );
}

if (start2PoolImageViewerImage) {
  start2PoolImageViewerImage.addEventListener(
    "pointerdown",
    event => {
      event.preventDefault();

      start2PoolImageViewerImage.setPointerCapture(
        event.pointerId
      );

      start2PoolImagePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });

      start2PoolImageMoved = false;

      if (start2PoolImagePointers.size === 1) {
        start2PoolImagePanStartX = event.clientX;
        start2PoolImagePanStartY = event.clientY;

        start2PoolImagePanTranslateX =
          start2PoolImageTranslateX;

        start2PoolImagePanTranslateY =
          start2PoolImageTranslateY;

        start2PoolImageViewerImage.classList.add(
          "dragging"
        );
      }

      if (start2PoolImagePointers.size === 2) {
        start2PoolImageStartDistance =
          getStart2PoolPointerDistance();

        start2PoolImageStartScale =
          start2PoolImageScale;
      }
    }
  );

  start2PoolImageViewerImage.addEventListener(
    "pointermove",
    event => {
      if (
        !start2PoolImagePointers.has(event.pointerId)
      ) {
        return;
      }

      event.preventDefault();

      start2PoolImagePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY
      });

      if (start2PoolImagePointers.size === 2) {
        const currentDistance =
          getStart2PoolPointerDistance();

        if (start2PoolImageStartDistance > 0) {
          start2PoolImageScale =
            start2PoolImageStartScale *
            (
              currentDistance /
              start2PoolImageStartDistance
            );

          start2PoolImageScale = Math.min(
            5,
            Math.max(1, start2PoolImageScale)
          );

          start2PoolImageMoved = true;

          applyStart2PoolImageTransform();
        }

        return;
      }

      if (
        start2PoolImagePointers.size === 1 &&
        start2PoolImageScale > 1
      ) {
        const differenceX =
          event.clientX - start2PoolImagePanStartX;

        const differenceY =
          event.clientY - start2PoolImagePanStartY;

        if (
          Math.abs(differenceX) > 3 ||
          Math.abs(differenceY) > 3
        ) {
          start2PoolImageMoved = true;
        }

        start2PoolImageTranslateX =
          start2PoolImagePanTranslateX + differenceX;

        start2PoolImageTranslateY =
          start2PoolImagePanTranslateY + differenceY;

        applyStart2PoolImageTransform();
      }
    }
  );

  function finishStart2PoolImagePointer(event) {
    const wasSingleTap =
      start2PoolImagePointers.size === 1 &&
      !start2PoolImageMoved;

    start2PoolImagePointers.delete(event.pointerId);

    start2PoolImageViewerImage.classList.remove(
      "dragging"
    );

    if (wasSingleTap) {
      if (start2PoolImageScale > 1) {
        resetStart2PoolImageZoom();
      } else {
        start2PoolImageScale = 2.5;
        applyStart2PoolImageTransform();
      }
    }
  }

  start2PoolImageViewerImage.addEventListener(
    "pointerup",
    finishStart2PoolImagePointer
  );

  start2PoolImageViewerImage.addEventListener(
    "pointercancel",
    finishStart2PoolImagePointer
  );
}

document
  .querySelectorAll(".start2pool-drill-image")
  .forEach(image => {
    image.setAttribute("role", "button");
    image.setAttribute("tabindex", "0");

    image.addEventListener("click", () => {
      openStart2PoolImage(image);
    });

    image.addEventListener("keydown", event => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        openStart2PoolImage(image);
      }
    });
  });

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    start2PoolImageViewer?.classList.contains("open")
  ) {
    closeStart2PoolImage();
  }
});

/* ===========================
   SPELER ZOEKEN
=========================== */

function openPlayerSearch() {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("playerSearchScreen")
        .classList.add("active");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    const input =
        document.getElementById("playerSearchInput");

    if (input) {
        setTimeout(() => input.focus(), 100);
    }
}


function closePlayerSearch() {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("competitionsScreen")
        .classList.add("active");
}


async function searchPlayers() {

    const input =
        document.getElementById("playerSearchInput");

    const status =
        document.getElementById("playerSearchStatus");

    const results =
        document.getElementById("playerSearchResults");

    const query =
        input.value.trim();

    if (query.length < 2) {

        status.style.display = "block";
        status.textContent =
            "Vul minstens 2 tekens in.";

        results.innerHTML = "";

        return;
    }

    status.style.display = "block";
    status.textContent = "Spelers zoeken...";

    results.innerHTML = "";

    try {

        const response = await fetch(
            `https://balenzo-cuescore.nicolasmintjens.workers.dev/?type=playerSearch&q=${encodeURIComponent(query)}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.error || "Spelers zoeken mislukt."
            );
        }

        const players =
            Array.isArray(data.players)
                ? data.players
                : [];

        if (!players.length) {

            status.textContent =
                "Geen spelers gevonden.";

            return;
        }

        status.style.display = "none";

        results.innerHTML =
            players.map(player => {

                const playerId =
                    String(player.playerId || "");

                const playerName =
                    String(player.name || "");

                const image =
                    String(player.image || "");

                const country =
                    String(player.country || "");

                const verified =
                    player.badge === "claimed";

                return `
                    <button
                        type="button"
                        class="player-search-result"
                        onclick="openPlayerSearchResult(
                            '${playerId}',
                            ${JSON.stringify(playerName).replace(/"/g, "&quot;")}
                        )"
                    >

                        <div class="player-search-result-image-wrap">

                            ${
                                image
                                    ? `
                                        <img
                                            class="player-search-result-image"
                                            src="${image}"
                                            alt=""
                                        >
                                    `
                                    : `
                                        <div class="player-search-result-placeholder">
                                            👤
                                        </div>
                                    `
                            }

                        </div>

                        <div class="player-search-result-info">

                            <div class="player-search-result-name">
                                ${escapePlayerSearchHtml(playerName)}

                                ${
                                    verified
                                        ? `<span class="player-search-verified">✓</span>`
                                        : ""
                                }
                            </div>

                            <div class="player-search-result-country">
                                ${escapePlayerSearchHtml(country)}
                            </div>

                        </div>

                        <div class="competition-arrow">
                            ›
                        </div>

                    </button>
                `;

            }).join("");

    } catch (error) {

        status.style.display = "block";
        status.textContent =
            "Spelers konden niet geladen worden.";

        results.innerHTML = "";
    }
}


function escapePlayerSearchHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function openPlayerSearchResult(playerId, playerName) {

    openTournamentPlayerDetail(
        playerId,
        playerName
    );

    playerDetailSource = "playerSearch";
}


/* Zoekknop + Enter-toets */

document
    .getElementById("playerSearchSubmit")
    ?.addEventListener("click", searchPlayers);

document
    .getElementById("playerSearchInput")
    ?.addEventListener("keydown", event => {

        if (event.key === "Enter") {

            event.preventDefault();

            searchPlayers();
        }
    });
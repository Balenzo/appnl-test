const APP_CHANGELOG_VERSION = "1.0";

let currentCompetitionData = null;
let currentCompetitionTournamentId = null;
let competitionLiveRefreshTimer = null;
let playerDetailSource = "team";
let currentMvpPercentage = null;

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

const favoriteOptions = {
  myProfile: {
    icon: '👤',
    title: tr('favorites.myProfile', 'Mijn profiel'),
    url: null
  },
  'club-live': {
    icon: '📺',
    title: 'Live Scores',
    url: 'https://cuescore.com/venue/table/jumbotron/?venueId=1280972&branchId=1'
  },
  'club-reservation': {
    icon: '🪑',
    title: tr('favorites.reserveTable', 'Tafel reserveren'),
    url: 'https://www.bal-enzo.be/reservaties/'
  },
  'club-page': {
    icon: '🎱',
    title: tr('favorites.clubPage', 'Clubpagina'),
    url: 'https://cuescore.com/bal-enzobilliardsdarts'
  },
  'competition-first': {
    icon: '🏆',
    title: tr('competition.firstDivision', 'Eerste Klasse'),
    url: null,
    action: () => openCompetitionDetail("74130085")
},

'competition-second': {
    icon: '🏆',
    title: tr('competition.secondDivision', 'Tweede Klasse'),
    url: null,
    action: () => openCompetitionDetail("74130109")
},

'competition-third': {
    icon: '🏆',
    title: tr('competition.thirdDivision', 'Derde Klasse'),
    url: null,
    action: () => openCompetitionDetail("74130127")
},

'competition-cup': {
    icon: '🏆',
    title: tr('competition.cup', 'Beker'),
    url: null,
    action: () => openCompetitionDetail("74130139")
},

'competition-nl': {
    icon: '🇳🇱',
    title: tr('competition.netherlands', 'Competitie NL'),
    url: null,
    action: () => openCompetitionDetail("83574892")
},

'breakplay-1': {
    icon: '🎱',
    title: tr('competition.breakPlay1', 'Break & Play Reeks 1'),
    url: null,
    action: () => openCompetitionDetail("85928236")
},

'breakplay-2': {
    icon: '🎱',
    title: tr('competition.breakPlay2', 'Break & Play Reeks 2'),
    url: null,
    action: () => openCompetitionDetail("85928569")
},

'breakplay-3': {
    icon: '🎱',
    title: tr('competition.breakPlay3', 'Break & Play Reeks 3'),
    url: null,
    action: () => openCompetitionDetail("85928635")
},

'breakplay-4': {
    icon: '🎱',
    title: tr('competition.breakPlay4', 'Break & Play Reeks 4'),
    url: null,
    action: () => openCompetitionDetail("85928797")
},

'breakplay-5': {
    icon: '🎱',
    title: tr('competition.breakPlay5', 'Break & Play Reeks 5'),
    url: null,
    action: () => openCompetitionDetail("85929085")
},
  facebook: {
    icon: '📘',
    title: 'Facebook',
    url: 'https://www.facebook.com/billiardsendarts'
  },
  instagram: {
    icon: '📸',
    title: 'Instagram',
    url: 'https://www.instagram.com/balenzo_billiards_darts/'
  },
 start2pool: {
  icon: '🎱',
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
      <span>${item.icon} ${item.title}</span>
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
  const lastSeenVersion = localStorage.getItem('appChangelogVersion');

  if (lastSeenVersion === APP_CHANGELOG_VERSION) {
    return;
  }

  alert(
    "🎉 Wat is er nieuw?\n\n" +
    "• Live scores in app zelf\n" +
    "• Competities + Break & Play rechtstreeks in app te bekijken\n" +
    "• Tafelreservatie gebeurt in app zelf\n" +
    "• Moneygames toegevoegd (ook voor trainingen zonder €)\n" +
    "• Diverse verbeteringen"
  );

  localStorage.setItem(
    'appChangelogVersion',
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
   TEST CUESCORE API
=========================== */

async function testCueScoreAPI() {

    try {

        const response = await fetch(
            "https://api.cuescore.com/tournament/?id=74130085"
        );

        const data = await response.json();

        console.log("🎱 CueScore API TEST:", data);

    } catch (error) {

        console.error("❌ CueScore API fout:", error);

    }

}

testCueScoreAPI();

/* ===========================
   OPEN COMPETITION DETAIL
=========================== */

async function openCompetitionDetail(tournamentId) {

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

    document.getElementById("competitionDetailTitle").textContent =
        "Competitie";

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

    cueScoreLink.href =
        cueScoreUrls[String(tournamentId)] ||
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

document.getElementById("competitionDetailTitle").textContent =
    competitionTitles[String(tournamentId)] || "Competitie";

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

        console.log("🏆 MVP DATA:", mvpData);
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
    }
}

    const standings =
    data.standings && data.standings["1"]
        ? data.standings["1"]
        : [];

if (!standings.length) {

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

                        <div class="standings-team">
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

const teams =
    data.standings && data.standings["1"]
        ? data.standings["1"]
        : [];

if (!teams.length) {

    teamsContainer.innerHTML =
        `<p>${tr("competition.noTeams", "Geen teams beschikbaar.")}</p>`;

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
    ${team.position}${tr("competition.placeSuffix", "e")} ${tr("competition.place", "plaats")}
</div>

        </div>

        <div class="competition-arrow">
            ›
        </div>

    </div>

`).join("");

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

    } else {

        const nextRound =
            getNextCompetitionRound(matches);

        if (!nextRound || !nextRound.matches.length) {

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
}

const upcomingFilter =
    document.getElementById("competitionMatchesUpcomingOnly");

const teamFilter =
    document.getElementById("competitionMatchesTeamFilter");

// Teams voor het keuzemenu verzamelen
if (teamFilter) {

    const teamNames = new Set();

    matches.forEach(match => {

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

    teamFilter.innerHTML = `
    <option value="">
        ${isBreakAndPlay ? tr("filters.allPlayers", "Alle spelers") : tr("filters.allTeams", "Alle teams")}
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

        const orderA =
            getCupRoundOrder(a.roundName);

        const orderB =
            getCupRoundOrder(b.roundName);

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

    const roundName =
        match.roundName || `${tr("competition.round", "Speelronde")} ${match.round || ""}`;

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

                            <div class="competition-match-team">
                                ${match.playerA?.name || "Onbekend"}
                            </div>

                            <div class="competition-match-score">
                                ${isFinished || isLive
    ? `${match.scoreA ?? 0} - ${match.scoreB ?? 0}`
    : "vs"}
                            </div>

                            <div class="competition-match-team competition-match-team-away">
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

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

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

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("competitionDetailScreen")
        .classList.add("active");
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

    document.getElementById("teamDetailPosition").textContent =
        `${team.position}${tr("competition.placeSuffix", "e")} ${tr("competition.place", "plaats")}`;

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
    sortedPlayers.map(player => `

        <div
            class="team-player-card"
            onclick="openPlayerDetail('${player.replace(/'/g, "\\'")}', '${teamId}')"
        >
            <span>${player}</span>

            <span class="team-player-arrow">
                ›
            </span>
        </div>

    `).join("");


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

    document
        .getElementById("competitionDetailScreen")
        .classList.add("active");
}

/* ===========================
   OPEN PLAYER DETAIL
=========================== */

async function openPlayerDetail(playerName, teamId) {

    if (!currentCompetitionData) {
        return;
    }

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

    const statsContainer =
        document.getElementById("playerDetailStats");

    statsContainer.innerHTML =
        tr("player.loadingStats", "Statistieken laden...");


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

    if (playerDetailSource === "mvp") {

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

function openMyProfile() {
  const profileUrl = localStorage.getItem("myProfileUrl");
  const iframe = document.getElementById("myProfileIframe");

  if (!profileUrl || !profileUrl.trim()) {
    openProfile();
    return;
  }

  if (iframe) {
    iframe.src = profileUrl.trim();
  }

  document.querySelectorAll(".screen")
    .forEach(screen => screen.classList.remove("active"));

  const screen = document.getElementById("myProfileScreen");

  if (screen) {
    screen.classList.add("active");
  }
}

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
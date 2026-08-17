let currentCompetitionData = null;

// ===============================
// FAVORIETEN
// ===============================

const favoriteOptions = {
  myProfile: {
    icon: '👤',
    title: 'Mijn profiel',
    url: null
  },
  'club-live': {
    icon: '📺',
    title: 'Live Scores',
    url: 'https://cuescore.com/venue/table/jumbotron/?venueId=1280972&branchId=1'
  },
  'club-reservation': {
    icon: '🪑',
    title: 'Tafel reserveren',
    url: 'https://www.bal-enzo.be/reservaties/'
  },
  'club-page': {
    icon: '🎱',
    title: 'Clubpagina',
    url: 'https://cuescore.com/bal-enzobilliardsdarts'
  },
  'competition-first': {
    icon: '🏆',
    title: 'Eerste Klasse',
    url: 'https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+EERSTE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130085'
  },
  'competition-second': {
    icon: '🏆',
    title: 'Tweede Klasse',
    url: 'https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+TWEEDE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130109'
  },
  'competition-third': {
    icon: '🏆',
    title: 'Derde Klasse',
    url: 'https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+DERDE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130127'
  },
  'competition-cup': {
    icon: '🏆',
    title: 'Beker',
    url: 'https://cuescore.com/tournament/%2A%2A%2ABEKER%252FCOUPE+BPBF+VLAANDEREN+2026%2A%2A%2A/74130139'
  },
  'competition-nl': {
    icon: '🇳🇱',
    title: 'Competitie NL',
    url: 'https://cuescore.com/tournament/Pool+Tweede+Divisie+Zuid+2026%252F2027/83574892'
  },
  'breakplay-1': {
    icon: '🎱',
    title: 'Break & Play Reeks 1',
    url: 'https://cuescore.com/tournament/POULE+1+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928236'
  },
  'breakplay-2': {
    icon: '🎱',
    title: 'Break & Play Reeks 2',
    url: 'https://cuescore.com/tournament/POULE+2+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928569'
  },
  'breakplay-3': {
    icon: '🎱',
    title: 'Break & Play Reeks 3',
    url: 'https://cuescore.com/tournament/POULE+3+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928635'
  },
  'breakplay-4': {
    icon: '🎱',
    title: 'Break & Play Reeks 4',
    url: 'https://cuescore.com/tournament/POULE+4+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85928797'
  },
  'breakplay-5': {
    icon: '🎱',
    title: 'Break & Play Reeks 5',
    url: 'https://cuescore.com/tournament/POULE+5+BREAK+%2526+PLAY+%252F+HERFST+2026+%2AClubcompetitie%2A/85929085'
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
        card = document.createElement('a');
        card.className = 'favorite-card';
        card.href = profileUrl.trim();
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
      } else {
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
  const url = prompt('Voer de link van je CueScore-profiel in:');
  if (!url) return;

  localStorage.setItem('myProfileUrl', url);
  alert('Profiel opgeslagen.');
}

function openProfile() {
  const url = localStorage.getItem('myProfileUrl');

  if (!url) {
    alert('Je hebt nog geen profiel ingesteld.');
    return;
  }

  window.open(url, '_blank');
}

document.addEventListener('DOMContentLoaded', function () {
  // Favorieten tonen
  renderFavorites();

  // Bottom navigation
  const screens = document.querySelectorAll('.screen');
  const navButtons = document.querySelectorAll('.nav-item');

  function showScreen(screenId) {
    screens.forEach(screen => {
      screen.classList.remove('active');
    });

    const selected = document.getElementById(screenId);

    if (selected) {
      selected.classList.add('active');
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
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
        if (confirm('Er is een nieuwe versie van de app beschikbaar. Wil je nu vernieuwen?')) {
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
            if (confirm('Er is een nieuwe versie van de app beschikbaar. Wil je nu vernieuwen?')) {
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

        const cueScoreLink =
    document.getElementById("competitionCueScoreLink");

if (cueScoreLink) {

    const cueScoreUrls = {
        "74130085": "https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+EERSTE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130085",
        "74130109": "https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+TWEEDE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130109",
        "74130127": "https://cuescore.com/tournament/%2A%2A%2ACOMPETITIE+DERDE+PROVINCIALE+BPBF+VLAANDEREN+SEIZOEN+2026%2A%2A%2A/74130127",
        "74130139": "https://cuescore.com/tournament/%2A%2A%2ABEKER%252FCOUPE+BPBF+VLAANDEREN+2026%2A%2A%2A/74130139",
        "83574892": "https://cuescore.com/tournament/Pool+Tweede+Divisie+Zuid+2026%252F2027/83574892"
    };

    cueScoreLink.href =
        cueScoreUrls[String(tournamentId)] ||
        `https://cuescore.com/tournament/${tournamentId}`;

}

        const standingsTab =
    document.querySelector(
        '.competition-detail-tab[onclick*="standings"]'
    );

const standingsPanel =
    document.getElementById("competitionTabStandings");

if (String(tournamentId) === "74130139") {

    standingsTab.style.display = "none";
    standingsPanel.style.display = "none";

} else {

    standingsTab.style.display = "";
}

        const competitionTitles = {
    "74130085": "Eerste Klasse",
    "74130109": "Tweede Klasse",
    "74130127": "Derde Klasse",
    "74130139": "Beker",
    "83574892": "Competitie NL"
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
            `Discipline: ${data.discipline}`;

            const standingsContainer =
    document.getElementById("competitionStandingsList");

const standings =
    data.standings && data.standings["1"]
        ? data.standings["1"]
        : [];

if (!standings.length) {

    standingsContainer.innerHTML =
        "<p>Geen stand beschikbaar.</p>";

} else {

        standingsContainer.innerHTML = `

    <div class="standings-scroll">

        <div class="standings-table standings-table-full">

            <div class="standings-row standings-header">
                <div>#</div>
                <div>Team</div>
                <div>G</div>
                <div>MP</div>
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
                        <div>${team.teamMatchPoints}</div>
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
        "<p>Geen teams beschikbaar.</p>";

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
    ${team.position}e plaats
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

if (!matches.length) {

    matchesContainer.innerHTML =
        "<p>Geen wedstrijden beschikbaar.</p>";

} else {

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

    sortedMatches = [...matches].sort((a, b) => {

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

    sortedMatches = [...matches].sort((a, b) => {
        return (a.round || 0) - (b.round || 0);
    });

}


// Wedstrijden groeperen per speelronde
const matchesByRound = {};

sortedMatches.forEach(match => {

    const roundName =
        match.roundName || `Speelronde ${match.round || ""}`;

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
                ${roundName}
            </div>

            ${roundMatches.map(match => {

                const isFinished =
                    match.matchstatus === "finished";

                    const isBalEnzoMatch =
    match.playerA?.name?.toLowerCase().includes("bal' enzo") ||
    match.playerB?.name?.toLowerCase().includes("bal' enzo");

                const date = match.starttime
                    ? new Date(match.starttime).toLocaleDateString(
                        "nl-BE",
                        {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric"
                        }
                    )
                    : "Datum onbekend";

                const time = match.starttime
                    ? new Date(match.starttime).toLocaleTimeString(
                        "nl-BE",
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    )
                    : "";

                return `

                    <div
    class="competition-match-card ${isBalEnzoMatch ? "balenzo-match" : ""}"
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
                                ${isFinished
                                    ? `${match.scoreA ?? 0} - ${match.scoreB ?? 0}`
                                    : "vs"}
                            </div>

                            <div class="competition-match-team competition-match-team-away">
                                ${match.playerB?.name || "Onbekend"}
                            </div>

                        </div>


                        <div class="competition-match-status">

                            ${isFinished
                                ? "Gespeeld"
                                : "Gepland"}

                        </div>

                        <div class="competition-match-venue">
    📍 ${match.playerA?.venue?.name || "Locatie niet bekend"}
</div>

                    </div>

                `;

            }).join("")}

        </div>

    `).join("");

}

    } catch (error) {

        console.error("CueScore laden mislukt:", error);

        document.getElementById("competitionName").textContent =
            "Kon competitie niet laden.";

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

    const roundName = match.roundName || "Wedstrijd";

document.getElementById("matchDetailRound").textContent =
    roundName.replace(/^Round\s+/i, "Ronde ");

    const dateText = match.starttime
        ? new Date(match.starttime).toLocaleString("nl-BE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        })
        : "Datum onbekend";

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
        statusElement.textContent = "Gelijkspel";
    } else {
        statusElement.textContent = "Gespeeld";
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

if (match.playerA?.venue?.name) {

    venueElement.textContent =
        `📍 ${match.playerA.venue.name}`;

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
        "<p>Individuele wedstrijden laden...</p>";

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
                "<p>Geen individuele wedstrijden beschikbaar.</p>";

            return;
        }

        individualContainer.innerHTML =
            data.matches.map(individualMatch => `

                <div class="individual-match-card">

                    <div class="individual-match-header">

                        <span>
                            Wedstrijd ${individualMatch.matchNo}
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
            "<p>Individuele wedstrijden konden niet geladen worden.</p>";

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
        team.player?.name || "Team";

    document.getElementById("teamDetailName").textContent =
        team.player?.name || "Onbekend";

    document.getElementById("teamDetailPosition").textContent =
        `${team.position}e plaats`;

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
        "Spelers laden...";


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
                "<p>Geen spelers gevonden.</p>";

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
            "<p>Spelers konden niet geladen worden.</p>";

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
        team.player?.name || "Team";

    const statsContainer =
        document.getElementById("playerDetailStats");

    statsContainer.innerHTML =
        "Statistieken laden...";


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
    individualMatch.discipline || "Onbekend";

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

            const percentage =
                stats.played > 0
                    ? Math.round(
                        (stats.wins / stats.played) * 100
                    )
                    : 0;

            return `

                <div class="player-discipline-card">

                    <div class="player-discipline-name">
                        ${discipline}
                    </div>

                    <div class="player-discipline-info">
                        ${stats.played} gespeeld ·
                        ${stats.wins} gewonnen ·
                        <strong>${percentage}%</strong>
                    </div>

                </div>

            `;

        })
        .join("");


        statsContainer.innerHTML = `

            <div class="player-stat-card">
                <span>Gespeeld</span>
                <strong>${played}</strong>
            </div>

            <div class="player-stat-card">
                <span>Gewonnen</span>
                <strong>${wins}</strong>
            </div>

            <div class="player-stat-card">
                <span>Verloren</span>
                <strong>${losses}</strong>
            </div>

            <div class="player-stat-card">
                <span>Gelijk</span>
                <strong>${draws}</strong>
            </div>

            <div class="player-stat-card">
                <span>Winstpercentage</span>
                <strong>${winPercentage}%</strong>
            </div>

            <div class="player-discipline-section">

    <div class="competition-title">
        Per discipline
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
            "<p>Statistieken konden niet geladen worden.</p>";

    }

}


/* ===========================
   CLOSE PLAYER DETAIL
=========================== */

function closePlayerDetail() {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    document
        .getElementById("teamDetailScreen")
        .classList.add("active");
}   
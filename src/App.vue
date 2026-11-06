<script setup lang="ts">
import { nextTick, ref, shallowRef } from "vue";
import {
  Disc3,
  History,
  LockKeyhole,
  Quote,
  Sparkles,
  Timer,
} from "lucide-vue-next";
import type { Team } from "./types/team";
import JogoDosVersos from "./games/jogo-dos-versos/index.vue";
import TunelDoTempo from "./games/tunel-do-tempo/index.vue";
import VitrineMusical from "./games/vitrine-musical/index.vue";
import SegredoMusical from "./games/segredo-musical/index.vue";
import VitrolaMusical from "./games/vitrola-musical/index.vue";
import RelogioMusical from "./games/relogio-musical/index.vue";
import { createTeamRound, type TeamRound } from "./games/relogio-musical/types";

const teams = ref<Team[]>([
  { name: "Time A", marker: "A", accent: "coral", score: 0 },
  { name: "Time B", marker: "B", accent: "violet", score: 0 },
]);
const musicClockRounds = ref<Record<string, TeamRound>>(
  Object.fromEntries(teams.value.map((team) => [team.marker, createTeamRound()])),
);

const teamDialog = ref<HTMLDialogElement | null>(null);
const editingTeam = ref<(typeof teams.value)[number] | null>(null);
const draftTeamName = ref("");

async function openTeamEditor(team: (typeof teams.value)[number]) {
  editingTeam.value = team;
  draftTeamName.value = team.name;
  await nextTick();
  teamDialog.value?.showModal();
}

function saveTeamName() {
  const name = draftTeamName.value.trim();

  if (!name || !editingTeam.value) {
    return;
  }

  editingTeam.value.name = name;
  teamDialog.value?.close();
}

const games = [
  {
    id: "jogo-dos-versos",
    title: "Jogo dos versos",
    icon: Quote,
  },
  {
    id: "tunel-do-tempo",
    title: "Túnel do tempo",
    icon: History,
  },
  {
    id: "vitrine-musical",
    title: "Vitrine musical",
    icon: Sparkles,
  },
  {
    id: "segredo-musical",
    title: "Segredo musical",
    icon: LockKeyhole,
  },
  {
    id: "vitrola-musical",
    title: "Vitrola musical",
    icon: Disc3,
  },
  {
    id: "relogio-musical",
    title: "Relógio musical",
    icon: Timer,
  },
];

const selectedGame = shallowRef<(typeof games)[number] | null>(null);
const activeTeamMarker = ref("A");
const verseResults = ref<
  Record<number, { segment: number; teamMarker: string | null }>
>({});
const timeTunnelResults = ref<
  Record<string, { points: 0 | 1 | 2; teamMarker: string | null }>
>({});
const showcaseResults = ref<
  Record<number, { points: 0 | 1 | 2; teamMarker: string | null }>
>({});
const turntableResults = ref<
  Record<string, { points: 0 | 1 | 2; teamMarker: string | null }>
>({});
const secretSongResults = ref<
  Record<
    number,
    {
      hintShown: boolean;
      outcome: "active" | "other" | "none" | null;
      teamMarker: string | null;
      points: number;
    }
  >
>({});

function toggleActiveTeam() {
  activeTeamMarker.value = activeTeamMarker.value === "A" ? "B" : "A";
}

function markVerseSegmentPlayed(verse: number, segment: number) {
  if (segment < 2 || segment > 4) {
    return;
  }

  const previousResult = verseResults.value[verse];
  if (previousResult?.segment === segment) {
    return;
  }

  if (previousResult?.teamMarker) {
    addTeamPoints(
      previousResult.teamMarker,
      previousResult.segment === 2 ? -3 : -1,
    );
  }

  const otherTeam = teams.value.find(
    (team) => team.marker !== activeTeamMarker.value,
  );
  const teamMarker =
    segment === 2
      ? activeTeamMarker.value
      : segment === 3
        ? otherTeam?.marker ?? null
        : null;

  verseResults.value = {
    ...verseResults.value,
    [verse]: { segment, teamMarker },
  };

  if (teamMarker) {
    addTeamPoints(teamMarker, segment === 2 ? 3 : 1);
  }
}

function addTeamPoints(marker: string, points: number) {
  const team = teams.value.find((candidate) => candidate.marker === marker);
  if (team) {
    team.score += points;
  }
}

function updateTimeTunnelResult(
  songId: string,
  points: 0 | 1 | 2,
  teamMarker: string | null,
) {
  const previous = timeTunnelResults.value[songId];
  if (previous?.teamMarker) {
    addTeamPoints(previous.teamMarker, -previous.points);
  }

  timeTunnelResults.value = {
    ...timeTunnelResults.value,
    [songId]: { points, teamMarker },
  };

  if (teamMarker) {
    addTeamPoints(teamMarker, points);
  }
}

function updateShowcaseResult(
  songId: number,
  points: 0 | 1 | 2,
  teamMarker: string | null,
) {
  const previous = showcaseResults.value[songId];
  if (previous?.teamMarker) {
    addTeamPoints(previous.teamMarker, -previous.points);
  }

  showcaseResults.value = {
    ...showcaseResults.value,
    [songId]: { points, teamMarker },
  };

  if (teamMarker) {
    addTeamPoints(teamMarker, points);
  }
}

function updateTurntableResult(
  songId: string,
  points: 0 | 1 | 2,
  teamMarker: string | null,
) {
  const previous = turntableResults.value[songId];
  if (previous?.teamMarker) {
    addTeamPoints(previous.teamMarker, -previous.points);
  }

  turntableResults.value = {
    ...turntableResults.value,
    [songId]: { points, teamMarker },
  };

  if (teamMarker) {
    addTeamPoints(teamMarker, points);
  }
}

function updateSecretSongResult(
  songId: number,
  result: {
    hintShown: boolean;
    outcome: "active" | "other" | "none" | null;
    teamMarker: string | null;
    points: number;
  },
) {
  const previous = secretSongResults.value[songId];
  if (previous?.teamMarker) {
    addTeamPoints(previous.teamMarker, -previous.points);
  }

  secretSongResults.value = {
    ...secretSongResults.value,
    [songId]: result,
  };

  if (result.teamMarker) {
    addTeamPoints(result.teamMarker, result.points);
  }
}

function updateMusicClockRounds(rounds: Record<string, TeamRound>) {
  musicClockRounds.value = rounds;
}
</script>

<template>
  <main class="home-screen">
    <section v-if="!selectedGame" class="game-layout">
      <header class="topbar">
        <button
          v-for="team in teams"
          :key="team.accent"
          class="team-score"
          type="button"
          :class="[
            `team-${team.accent}`,
            { 'is-active': team.marker === activeTeamMarker },
          ]"
          :aria-label="`Editar nome do ${team.name}, pontuação ${team.score}`"
          :aria-current="team.marker === activeTeamMarker ? 'true' : undefined"
          @click="openTeamEditor(team)"
        >
          <div class="team-mark" aria-hidden="true">
            {{ team.marker }}
          </div>
          <div class="team-info">
            <span class="team-label">{{ team.name }}</span>
            <span class="team-points">PONTOS</span>
          </div>
          <span class="score-number">{{ String(team.score).padStart(2, "0") }}</span>
        </button>
      </header>

      <div class="brand">
        <img
          class="brand-logo"
          src="/Qualmusica.webp"
          alt="Qual é a música?"
        />
      </div>

      <section class="mode-section" aria-label="Modos de jogo">
        <div class="game-grid">
          <button
            v-for="game in games"
            :key="game.title"
            class="game-card"
            type="button"
            @click="selectedGame = game"
          >
            <div class="game-icon" aria-hidden="true">
              <component :is="game.icon" :size="22" :stroke-width="1.7" />
            </div>
            <span class="game-title">{{ game.title }}</span>
          </button>
        </div>
      </section>
    </section>

    <dialog
      ref="teamDialog"
      class="team-dialog"
      aria-labelledby="team-dialog-title"
      @close="editingTeam = null"
      @click.self="teamDialog?.close()"
    >
      <form class="team-dialog-form" @submit.prevent="saveTeamName">
        <p class="dialog-eyebrow">PERSONALIZE SEU TIME</p>
        <h2 id="team-dialog-title">Trocar nome</h2>
        <label class="team-name-label" for="team-name">Nome do time</label>
        <input
          id="team-name"
          v-model="draftTeamName"
          class="team-name-input"
          maxlength="24"
          required
          autofocus
        />
        <div class="dialog-actions">
          <button
            class="dialog-button dialog-cancel"
            type="button"
            @click="teamDialog?.close()"
          >
            Cancelar
          </button>
          <button class="dialog-button dialog-save" type="submit">Salvar</button>
        </div>
      </form>
    </dialog>

    <JogoDosVersos
      v-if="selectedGame?.id === 'jogo-dos-versos'"
      :teams="teams"
      :active-team-marker="activeTeamMarker"
      :verse-results="verseResults"
      @back="selectedGame = null"
      @toggle-turn="toggleActiveTeam"
      @segment-played="markVerseSegmentPlayed"
    />

    <TunelDoTempo
      v-else-if="selectedGame?.id === 'tunel-do-tempo'"
      :teams="teams"
      :active-team-marker="activeTeamMarker"
      :song-results="timeTunnelResults"
      @back="selectedGame = null"
      @toggle-turn="toggleActiveTeam"
      @result-selected="updateTimeTunnelResult"
    />

    <VitrineMusical
      v-else-if="selectedGame?.id === 'vitrine-musical'"
      :teams="teams"
      :active-team-marker="activeTeamMarker"
      :song-results="showcaseResults"
      @back="selectedGame = null"
      @toggle-turn="toggleActiveTeam"
      @result-selected="updateShowcaseResult"
    />

    <VitrolaMusical
      v-else-if="selectedGame?.id === 'vitrola-musical'"
      :teams="teams"
      :active-team-marker="activeTeamMarker"
      :song-results="turntableResults"
      @back="selectedGame = null"
      @toggle-turn="toggleActiveTeam"
      @result-selected="updateTurntableResult"
    />

    <SegredoMusical
      v-else-if="selectedGame?.id === 'segredo-musical'"
      :teams="teams"
      :active-team-marker="activeTeamMarker"
      :results="secretSongResults"
      @back="selectedGame = null"
      @toggle-turn="toggleActiveTeam"
      @result-changed="updateSecretSongResult"
    />

    <RelogioMusical
      v-else-if="selectedGame?.id === 'relogio-musical'"
      :teams="teams"
      :active-team-marker="activeTeamMarker"
      :rounds="musicClockRounds"
      @back="selectedGame = null"
      @toggle-turn="toggleActiveTeam"
      @point-scored="addTeamPoints"
      @rounds-changed="updateMusicClockRounds"
    />

  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { Music2, Pause, Play, X } from "lucide-vue-next";
import GameScreen from "../../components/GameScreen.vue";
import type { Team } from "../../types/team";

type SongPoints = 0 | 1 | 2;
type SongResult = { points: SongPoints; teamMarker: string | null };
interface TunnelSong {
  id: string;
  year: number;
  note: string;
  title: string;
  artist: string;
  audioUrl: string;
}

const props = defineProps<{
  teams: Team[];
  activeTeamMarker: string;
  songResults: Record<string, SongResult>;
}>();
const emit = defineEmits<{
  back: [];
  toggleTurn: [];
  resultSelected: [songId: string, points: SongPoints, teamMarker: string | null];
}>();

const categories = [2016, 2006, 1996, 1986];
const notes = ["Dó", "Ré", "Mi", "Fá", "Sol"];
const songs = ref<TunnelSong[]>([]);
const songsById = computed(() =>
  Object.fromEntries(songs.value.map((song) => [song.id, song])),
);
const songLoadMessage = ref("Carregando músicas...");
const songDialog = ref<HTMLDialogElement | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const selectedSongId = ref<string | null>(null);
const audioMessage = ref("");
const audioPlaying = ref(false);

function parseAudioFilename(fileName: string): TunnelSong | null {
  const match = fileName.match(
    /^([1-5]) - (2016|2006|1996|1986) - (.+) - (.+)\.mp3$/i,
  );
  if (!match) {
    return null;
  }

  const [, numberText, yearText, title, artist] = match;
  const number = Number(numberText);
  const year = Number(yearText);
  const note = notes[number - 1];

  if (!note || !title.trim() || !artist.trim()) {
    return null;
  }

  return {
    id: `${year}-${note}`,
    year,
    note,
    title: title.trim(),
    artist: artist.trim(),
    audioUrl: `/tunel-do-tempo/${encodeURIComponent(fileName)}`,
  };
}

async function loadSongs() {
  try {
    const response = await fetch("/__dev/tunel-do-tempo-audios");
    if (!response.ok) {
      throw new Error(`O servidor respondeu com status ${response.status}.`);
    }

    const fileNames: unknown = await response.json();
    if (
      !Array.isArray(fileNames) ||
      !fileNames.every((fileName) => typeof fileName === "string")
    ) {
      throw new Error("A lista de áudios retornada pelo servidor é inválida.");
    }

    const parsedSongs = fileNames
      .map(parseAudioFilename)
      .filter((song): song is TunnelSong => song !== null);
    const songsByKey = new Map<string, TunnelSong>();
    const duplicateIds = new Set<string>();

    for (const song of parsedSongs) {
      if (songsByKey.has(song.id)) {
        duplicateIds.add(song.id);
      } else {
        songsByKey.set(song.id, song);
      }
    }

    songs.value = categories.flatMap((year) =>
      notes.flatMap((note) => {
        const song = songsByKey.get(`${year}-${note}`);
        return song ? [song] : [];
      }),
    );

    const missingIds = categories.flatMap((year) =>
      notes
        .map((note) => `${year}-${note}`)
        .filter((id) => !songsByKey.has(id)),
    );
    const issues = [
      fileNames.length !== parsedSongs.length
        ? `${fileNames.length - parsedSongs.length} arquivo(s) têm nome fora do padrão.`
        : "",
      duplicateIds.size
        ? `Há arquivos duplicados para: ${[...duplicateIds].join(", ")}.`
        : "",
      missingIds.length
        ? `Faltam músicas para: ${missingIds.join(", ")}.`
        : "",
    ].filter(Boolean);

    songLoadMessage.value = issues.join(" ");
  } catch (error) {
    songLoadMessage.value =
      error instanceof Error
        ? `Não foi possível carregar as músicas do Túnel do tempo: ${error.message}`
        : "Não foi possível carregar as músicas do Túnel do tempo.";
  }
}

const selectedSong = computed(
  () => songsById.value[selectedSongId.value ?? ""] ?? null,
);
const selectedResult = computed(() =>
  selectedSongId.value ? props.songResults[selectedSongId.value] : undefined,
);

function teamForMarker(marker: string) {
  return props.teams.find((team) => team.marker === marker);
}

async function showSongDialog(songId: string) {
  stopAudio();
  selectedSongId.value = songId;
  audioMessage.value = "";
  await nextTick();
  if (!songDialog.value?.open) {
    songDialog.value?.showModal();
  }
}

function resultClass(songId: string) {
  const result = props.songResults[songId];
  if (!result) {
    return "";
  }
  if (result.points === 0 || !result.teamMarker) {
    return "is-neutral";
  }
  return `is-${teamForMarker(result.teamMarker)?.accent ?? "neutral"}`;
}

function scoreSong(points: SongPoints) {
  const song = selectedSong.value;
  if (!song) {
    return;
  }

  const teamMarker = points === 0 ? null : props.activeTeamMarker;
  emit("resultSelected", song.id, points, teamMarker);
}

function closeDialog() {
  stopAudio();
  selectedSongId.value = null;
  audioMessage.value = "";
}

async function previewAudio() {
  const audio = audioElement.value;
  if (!audio) {
    audioMessage.value = "Não foi possível carregar o áudio desta música.";
    return;
  }

  if (audioPlaying.value) {
    audio.pause();
    audioPlaying.value = false;
    audioMessage.value = "Áudio pausado.";
    return;
  }

  try {
    await audio.play();
    audioPlaying.value = true;
    audioMessage.value = "";
  } catch {
    audioPlaying.value = false;
    audioMessage.value = "Não foi possível reproduzir este áudio.";
  }
}

function stopAudio() {
  audioElement.value?.pause();
  if (audioElement.value) {
    audioElement.value.currentTime = 0;
  }
  audioPlaying.value = false;
}

function handleAudioEnded() {
  audioPlaying.value = false;
}

function handleAudioError() {
  audioPlaying.value = false;
  audioMessage.value = "Não foi possível carregar o áudio desta música.";
}

onMounted(loadSongs);
onUnmounted(stopAudio);
</script>

<template>
  <GameScreen
    title="Túnel do tempo"
    :teams="teams"
    :active-team-marker="activeTeamMarker"
    @back="emit('back')"
    @toggle-turn="emit('toggleTurn')"
  >
    <section class="time-tunnel-game" aria-label="Categorias do Túnel do tempo">
      <h1 class="time-tunnel-heading">Túnel do tempo</h1>
      <p v-if="songLoadMessage" class="time-tunnel-audio-message" role="status">
        {{ songLoadMessage }}
      </p>
      <div class="time-tunnel-categories">
        <section
          v-for="year in categories"
          :key="year"
          class="time-tunnel-category"
          :aria-labelledby="`year-${year}`"
        >
          <h2 :id="`year-${year}`">{{ year }}</h2>
          <div class="time-tunnel-notes">
            <button
              v-for="note in notes"
              :key="`${year}-${note}`"
              class="time-tunnel-note"
              :class="resultClass(`${year}-${note}`)"
              type="button"
              :disabled="!songsById[`${year}-${note}`]"
              :aria-label="`${note}, ${year}${songResults[`${year}-${note}`] ? `, ${songResults[`${year}-${note}`].points} pontos` : ''}`"
              @click="showSongDialog(`${year}-${note}`)"
            >
              {{ note }}
            </button>
          </div>
        </section>
      </div>
    </section>

    <dialog
      ref="songDialog"
      class="time-tunnel-dialog"
      aria-labelledby="time-tunnel-dialog-title"
      @close="closeDialog"
      @click.self="songDialog?.close()"
    >
      <button
        class="time-tunnel-dialog-close"
        type="button"
        aria-label="Fechar modal"
        @click="songDialog?.close()"
      >
        <X :size="18" :stroke-width="2" />
      </button>
      <section v-if="selectedSong" class="time-tunnel-dialog-content">
        <p class="dialog-eyebrow">TÚNEL DO TEMPO · {{ selectedSong.year }}</p>
        <h2 id="time-tunnel-dialog-title">
          Música {{ selectedSong.note }}
        </h2>

        <div class="time-tunnel-song-card">
          <Music2 :size="24" :stroke-width="1.7" aria-hidden="true" />
          <div class="time-tunnel-song-info">
            <span>{{ selectedSong.note }} · {{ selectedSong.year }}</span>
            <strong v-if="selectedResult">
              {{ selectedSong.title }} · {{ selectedSong.artist }}
            </strong>
          </div>
        </div>

        <audio
          ref="audioElement"
          :src="selectedSong.audioUrl"
          preload="none"
          @ended="handleAudioEnded"
          @error="handleAudioError"
        ></audio>

        <div class="time-tunnel-actions" aria-label="Resultado da música">
          <button
            class="time-tunnel-action time-tunnel-play"
            type="button"
            :aria-label="audioPlaying ? 'Pausar música' : 'Tocar música'"
            @click="previewAudio"
          >
            <Pause v-if="audioPlaying" :size="18" :stroke-width="2" />
            <Play v-else :size="18" :stroke-width="2" />
          </button>
          <button
            class="time-tunnel-action time-tunnel-score"
            :class="{ 'is-selected': selectedResult?.points === 2 }"
            type="button"
            :aria-pressed="selectedResult?.points === 2"
            @click="scoreSong(2)"
          >
            <span>Acertou música e artista</span>
            <strong>2 pontos</strong>
          </button>
          <button
            class="time-tunnel-action time-tunnel-score"
            :class="{ 'is-selected': selectedResult?.points === 1 }"
            type="button"
            :aria-pressed="selectedResult?.points === 1"
            @click="scoreSong(1)"
          >
            <span>Acertou música ou artista</span>
            <strong>1 ponto</strong>
          </button>
          <button
            class="time-tunnel-action time-tunnel-score"
            :class="{ 'is-selected is-neutral': selectedResult?.points === 0 }"
            type="button"
            :aria-pressed="selectedResult?.points === 0"
            @click="scoreSong(0)"
          >
            <span>Nenhum acerto</span>
            <strong>0 pontos</strong>
          </button>
        </div>

        <p v-if="audioMessage" class="time-tunnel-audio-message" role="status">
          {{ audioMessage }}
        </p>
      </section>
    </dialog>
  </GameScreen>
</template>

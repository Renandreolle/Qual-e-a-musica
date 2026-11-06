<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  Clapperboard,
  Globe2,
  Music2,
  Pause,
  Play,
  X,
} from "lucide-vue-next";
import GameScreen from "../../components/GameScreen.vue";
import type { Team } from "../../types/team";

type SongPoints = 0 | 1 | 2;
type SongResult = { points: SongPoints; teamMarker: string | null };
interface TurntableSong {
  id: string;
  categoryId: string;
  number: number;
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

const categories = [
  { id: "one-hit-wonders", code: "ohw", title: "One hit wonders", icon: Globe2, flag: null },
  {
    id: "brazilian-bands",
    code: "bms",
    title: "Bandas de uma música só",
    icon: null,
    flag: "brazil",
  },
  {
    id: "brega-pernambucano",
    code: "brega",
    title: "Brega pernambucano",
    icon: null,
    flag: "pernambuco",
  },
  { id: "soundtracks", code: "trilha", title: "Trilhas de", icon: Clapperboard, flag: null },
];
const notes = ["Dó", "Ré", "Mi", "Fá", "Sol"];
const songs = ref<TurntableSong[]>([]);
const songsById = computed(() =>
  Object.fromEntries(songs.value.map((song) => [song.id, song])),
);
const songLoadMessage = ref("Carregando músicas...");
const songDialog = ref<HTMLDialogElement | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const selectedSongId = ref<string | null>(null);
const audioMessage = ref("");
const audioPlaying = ref(false);

function parseAudioFilename(fileName: string): TurntableSong | null {
  const match = fileName.match(/^([1-5]) - (ohw|bms|brega|trilha) - (.+) - (.+)\.mp3$/i);
  if (!match) {
    return null;
  }

  const [, numberText, categoryCode, title, artist] = match;
  const number = Number(numberText);
  const category = categories.find(
    (candidate) => candidate.code === categoryCode.toLowerCase(),
  );
  const note = notes[number - 1];

  if (!category || !note || !title.trim() || !artist.trim()) {
    return null;
  }

  return {
    id: `${category.id}-${note}`,
    categoryId: category.id,
    number,
    note,
    title: title.trim(),
    artist: artist.trim(),
    audioUrl: `/vitrola-musical/${encodeURIComponent(fileName)}`,
  };
}

async function loadSongs() {
  try {
    const response = await fetch("/__dev/vitrola-musical-audios");
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
      .filter((song): song is TurntableSong => song !== null);
    const songsByKey = new Map<string, TurntableSong>();
    const duplicateIds = new Set<string>();

    for (const song of parsedSongs) {
      if (songsByKey.has(song.id)) {
        duplicateIds.add(song.id);
      } else {
        songsByKey.set(song.id, song);
      }
    }

    songs.value = categories.flatMap((category) =>
      notes.flatMap((note) => {
        const song = songsByKey.get(`${category.id}-${note}`);
        return song ? [song] : [];
      }),
    );

    const missingIds = categories.flatMap((category) =>
      notes
        .map((note) => `${category.id}-${note}`)
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
        ? `Não foi possível carregar as músicas da Vitrola musical: ${error.message}`
        : "Não foi possível carregar as músicas da Vitrola musical.";
  }
}

const selectedSong = computed(
  () => songsById.value[selectedSongId.value ?? ""] ?? null,
);
const selectedCategory = computed(() =>
  categories.find((category) => category.id === selectedSong.value?.categoryId),
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

  emit(
    "resultSelected",
    song.id,
    points,
    points === 0 ? null : props.activeTeamMarker,
  );
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
    title="Vitrola musical"
    :teams="teams"
    :active-team-marker="activeTeamMarker"
    @back="emit('back')"
    @toggle-turn="emit('toggleTurn')"
  >
    <section class="turntable-game" aria-label="Categorias da Vitrola musical">
      <h1 class="time-tunnel-heading">Vitrola musical</h1>
      <p v-if="songLoadMessage" class="time-tunnel-audio-message" role="status">
        {{ songLoadMessage }}
      </p>
      <div class="time-tunnel-categories turntable-categories">
        <section
          v-for="category in categories"
          :key="category.id"
          class="time-tunnel-category turntable-category"
          :aria-labelledby="`turntable-${category.id}`"
        >
          <div class="turntable-category-heading">
            <span
              class="turntable-category-symbol"
              :aria-label="category.flag ? `Bandeira ${category.flag === 'brazil' ? 'do Brasil' : 'de Pernambuco'}` : undefined"
              :aria-hidden="category.flag ? undefined : 'true'"
              role="img"
            >
              <svg
                v-if="category.flag === 'brazil'"
                class="turntable-flag"
                viewBox="0 0 36 24"
                aria-hidden="true"
              >
                <rect width="36" height="24" rx="3" fill="#009b3a" />
                <path d="M18 3 32 12 18 21 4 12Z" fill="#ffdf00" />
                <circle cx="18" cy="12" r="5.6" fill="#002776" />
                <path
                  d="M12.7 10.1c3.5-.8 7.3-.5 10.7.7"
                  fill="none"
                  stroke="#fff"
                  stroke-width="1.1"
                />
                <g fill="#fff">
                  <circle cx="15.1" cy="11.5" r=".45" />
                  <circle cx="17.3" cy="13.8" r=".4" />
                  <circle cx="19.1" cy="10.6" r=".4" />
                  <circle cx="21.4" cy="12.2" r=".35" />
                  <circle cx="18" cy="9.2" r=".35" />
                </g>
              </svg>
              <svg
                v-else-if="category.flag === 'pernambuco'"
                class="turntable-flag"
                viewBox="0 0 36 24"
                aria-hidden="true"
              >
                <rect width="36" height="16" rx="3" fill="#003da5" />
                <rect y="14" width="36" height="10" fill="#fff" />
                <path
                  d="M10 15a8 8 0 0 1 16 0"
                  fill="none"
                  stroke="#d71920"
                  stroke-width="2"
                />
                <path
                  d="M12 15a6 6 0 0 1 12 0"
                  fill="none"
                  stroke="#ffdc00"
                  stroke-width="2"
                />
                <path
                  d="M14 15a4 4 0 0 1 8 0"
                  fill="none"
                  stroke="#00a650"
                  stroke-width="2"
                />
                <circle cx="18" cy="13.2" r="1.3" fill="#ffdc00" />
                <path
                  d="m18 4 .65 1.35 1.5.22-1.08 1.05.26 1.5L18 7.4l-1.33.72.26-1.5-1.08-1.05 1.5-.22Z"
                  fill="#ffdc00"
                />
                <path d="M16.4 18h3.2v4h-3.2zM15 19.2h6v1.1h-6z" fill="#d71920" />
              </svg>
              <component
                v-else
                :is="category.icon"
                :size="19"
                :stroke-width="1.8"
              />
            </span>
            <h2 :id="`turntable-${category.id}`">{{ category.title }}</h2>
          </div>
          <div class="time-tunnel-notes">
            <button
              v-for="note in notes"
              :key="`${category.id}-${note}`"
              class="time-tunnel-note"
              :class="resultClass(`${category.id}-${note}`)"
              type="button"
              :disabled="!songsById[`${category.id}-${note}`]"
              :aria-label="`${note}, ${category.title}${songResults[`${category.id}-${note}`] ? `, ${songResults[`${category.id}-${note}`].points} pontos` : ''}`"
              @click="showSongDialog(`${category.id}-${note}`)"
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
      aria-labelledby="turntable-dialog-title"
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
        <p class="dialog-eyebrow">VITROLA MUSICAL · {{ selectedCategory?.title }}</p>
        <h2 id="turntable-dialog-title">Música {{ selectedSong.note }}</h2>

        <div class="time-tunnel-song-card">
          <Music2 :size="24" :stroke-width="1.7" aria-hidden="true" />
          <div class="time-tunnel-song-info">
            <span>{{ selectedSong.note }} · {{ selectedCategory?.title }}</span>
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

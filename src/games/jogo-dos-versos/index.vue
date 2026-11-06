<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { Volume2, X } from "lucide-vue-next";
import GameScreen from "../../components/GameScreen.vue";
import type { Team } from "../../types/team";

interface VersePart {
  verse: number;
  part: 1 | 2;
  phrase: string;
  title: string;
  artist: string;
  audioUrl: string;
}

interface VerseChallenge {
  parts: [VersePart, VersePart];
}

const props = defineProps<{
  teams: Team[];
  activeTeamMarker: string;
  verseResults: Record<
    number,
    { segment: number; teamMarker: string | null }
  >;
}>();

const emit = defineEmits<{
  back: [];
  toggleTurn: [];
  segmentPlayed: [verse: number, segment: number];
}>();

const verses = Array.from({ length: 10 }, (_, index) => index + 1);
const verseChallenges = ref<Record<number, VerseChallenge>>({});
const verseLoadMessage = ref("Carregando versos...");
const verseDialog = ref<HTMLDialogElement | null>(null);
const songAudio = ref<HTMLAudioElement | null>(null);
const currentVerse = ref<number | null>(null);
const currentAudioPart = ref<1 | 2>(1);
const currentExcerpt = ref("");
const isPlaying = ref(false);
const audioError = ref("");
let excerptAnimation: ReturnType<typeof setInterval> | undefined;
let excerptAnimationTarget = "";

const selectedVerse = computed(() =>
  currentVerse.value === null
    ? null
    : (verseChallenges.value[currentVerse.value] ?? null),
);
const selectedResult = computed(() =>
  currentVerse.value === null
    ? undefined
    : props.verseResults[currentVerse.value],
);
const completeLyric = computed(() => {
  if (!selectedVerse.value) {
    return "";
  }

  const [beginning, ending] = selectedVerse.value.parts;
  return `“${beginning.phrase}... ${ending.phrase}”`;
});
const firstLyricPart = computed(() =>
  selectedVerse.value
    ? `“${selectedVerse.value.parts[0].phrase}...`
    : "",
);
const audioUrl = computed(
  () => selectedVerse.value?.parts[currentAudioPart.value - 1].audioUrl ?? "",
);

function parseVersePart(fileName: string): VersePart | null {
  const fields = fileName.replace(/\.mp3$/i, "").split(" - ");
  if (fields.length !== 5) {
    return null;
  }

  const [verseText, partText, phrase, title, artist] = fields;
  const verse = Number(verseText);
  const part = Number(partText);
  if (
    !Number.isInteger(verse) ||
    verse < 1 ||
    verse > 10 ||
    (part !== 1 && part !== 2) ||
    !phrase.trim() ||
    !title.trim() ||
    !artist.trim()
  ) {
    return null;
  }

  return {
    verse,
    part,
    phrase: phrase.trim(),
    title: title.trim(),
    artist: artist.trim(),
    audioUrl: `/jogo-dos-versos/${encodeURIComponent(fileName)}`,
  };
}

async function loadVerseChallenges() {
  try {
    const response = await fetch("/__dev/jogo-dos-versos-audios");
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

    const parsedParts = fileNames
      .map(parseVersePart)
      .filter((part): part is VersePart => part !== null);
    const partsByVerse = new Map<
      number,
      Partial<Record<1 | 2, VersePart>>
    >();
    const duplicateParts = new Set<string>();

    for (const part of parsedParts) {
      const verseParts = partsByVerse.get(part.verse) ?? {};
      if (verseParts[part.part]) {
        duplicateParts.add(`${part.verse}.${part.part}`);
        continue;
      }
      verseParts[part.part] = part;
      partsByVerse.set(part.verse, verseParts);
    }

    const challenges: Record<number, VerseChallenge> = {};
    const missingParts: string[] = [];
    for (const verse of verses) {
      const verseParts = partsByVerse.get(verse);
      const beginning = verseParts?.[1];
      const ending = verseParts?.[2];
      if (beginning && ending) {
        challenges[verse] = { parts: [beginning, ending] };
      } else {
        if (!beginning) missingParts.push(`${verse} parte 1`);
        if (!ending) missingParts.push(`${verse} parte 2`);
      }
    }
    verseChallenges.value = challenges;

    const issues = [
      fileNames.length !== parsedParts.length
        ? `${fileNames.length - parsedParts.length} arquivo(s) têm nome fora do padrão.`
        : "",
      duplicateParts.size
        ? `Há partes duplicadas para os versos: ${[...duplicateParts].join(", ")}.`
        : "",
      missingParts.length
        ? `Faltam arquivos para: ${missingParts.join(", ")}.`
        : "",
    ].filter(Boolean);
    verseLoadMessage.value = issues.join(" ");
  } catch (error) {
    verseLoadMessage.value =
      error instanceof Error
        ? `Não foi possível carregar os versos: ${error.message}`
        : "Não foi possível carregar os versos.";
  }
}

function stopAudio() {
  songAudio.value?.pause();
  if (songAudio.value) {
    songAudio.value.currentTime = 0;
  }
  isPlaying.value = false;
  currentAudioPart.value = 1;
}

async function toggleAudio() {
  const audio = songAudio.value;
  if (!audio || !selectedVerse.value) {
    audioError.value = "Não foi possível carregar o arquivo de áudio.";
    return;
  }

  audioError.value = "";
  if (!audio.paused) {
    audio.pause();
    isPlaying.value = false;
    return;
  }

  try {
    if (audio.ended) {
      currentAudioPart.value = 1;
      await nextTick();
      audio.currentTime = 0;
    }
    await audio.play();
    isPlaying.value = true;
  } catch (error) {
    audioError.value = "Não foi possível reproduzir o áudio.";
    console.error("Falha ao reproduzir áudio do Jogo dos Versos.", error);
  }
}

function handleAudioEnded() {
  isPlaying.value = false;
  currentAudioPart.value = 1;
}

async function playAnswerAudio() {
  const audio = songAudio.value;
  if (!audio || !selectedVerse.value) {
    audioError.value = "Não foi possível carregar o arquivo de áudio.";
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  isPlaying.value = false;
  currentAudioPart.value = 2;
  audioError.value = "";

  await nextTick();
  try {
    await audio.play();
    isPlaying.value = true;
  } catch (error) {
    audioError.value = "Não foi possível reproduzir a segunda parte do áudio.";
    console.error("Falha ao reproduzir áudio do Jogo dos Versos.", error);
  }
}

function handleAudioError() {
  isPlaying.value = false;
  audioError.value = "Não foi possível carregar o arquivo de áudio.";
}

function stopExcerptAnimation() {
  if (excerptAnimation !== undefined) {
    clearInterval(excerptAnimation);
    excerptAnimation = undefined;
  }
}

function revealLyric(target: string) {
  excerptAnimationTarget = target;
  if (excerptAnimation !== undefined) {
    return;
  }

  excerptAnimation = setInterval(() => {
    const nextLength = currentExcerpt.value.length + 1;
    currentExcerpt.value = excerptAnimationTarget.slice(0, nextLength);

    if (nextLength >= excerptAnimationTarget.length) {
      stopExcerptAnimation();
    }
  }, 24);
}

function teamForMarker(marker: string) {
  return props.teams.find((team) => team.marker === marker);
}

function resultClass(verse: number, prefix: "is-resolved" | "is-selected") {
  const result = props.verseResults[verse];
  if (!result) {
    return "";
  }

  if (!result.teamMarker) {
    return `${prefix}-neutral`;
  }

  return `${prefix}-${teamForMarker(result.teamMarker)?.accent ?? "neutral"}`;
}

async function openVerse(verse: number) {
  if (!verseChallenges.value[verse]) {
    return;
  }

  stopExcerptAnimation();
  stopAudio();
  audioError.value = "";
  currentVerse.value = verse;
  const result = props.verseResults[verse];
  currentExcerpt.value = result ? completeLyric.value : "";

  await nextTick();
  if (!verseDialog.value?.open) {
    verseDialog.value?.showModal();
  }
}

function playSegment(segment: number) {
  if (currentVerse.value === null || !selectedVerse.value) {
    return;
  }

  const verse = currentVerse.value;
  if (segment === 1) {
    revealLyric(props.verseResults[verse] ? completeLyric.value : firstLyricPart.value);
    return;
  }

  revealLyric(completeLyric.value);
  emit("segmentPlayed", verse, segment);
  void playAnswerAudio();
}

function outcomeTeamName(segment: number) {
  const result =
    currentVerse.value === null
      ? undefined
      : props.verseResults[currentVerse.value];
  const scoredTeamMarker =
    result?.segment === 2 || result?.segment === 3
      ? result.teamMarker
      : null;
  const team =
    scoredTeamMarker
      ? teamForMarker(
          result?.segment === segment
            ? scoredTeamMarker
            : props.teams.find(
                (candidate) => candidate.marker !== scoredTeamMarker,
              )?.marker ?? "",
        )
      : segment === 2
        ? teamForMarker(props.activeTeamMarker)
        : props.teams.find(
            (candidate) => candidate.marker !== props.activeTeamMarker,
          );

  return team?.name ?? (segment === 2 ? "Time X" : "Time Y");
}

function outcomeClass() {
  return resultClass(currentVerse.value ?? 0, "is-selected");
}

function closeVerseDialog() {
  stopExcerptAnimation();
  stopAudio();
  currentVerse.value = null;
}

onMounted(loadVerseChallenges);
</script>

<template>
  <GameScreen
    title="Jogo dos versos"
    :teams="teams"
    :active-team-marker="activeTeamMarker"
    @back="emit('back')"
    @toggle-turn="emit('toggleTurn')"
  >
    <section class="verses-game" aria-label="Seleção dos versos">
      <h1 class="verses-heading">Jogo dos versos</h1>
      <p v-if="verseLoadMessage" class="verse-load-message" role="status">
        {{ verseLoadMessage }}
      </p>
      <div class="verse-grid">
        <button
          v-for="verse in verses"
          :key="verse"
          class="verse-card"
          :class="resultClass(verse, 'is-resolved')"
          type="button"
          :disabled="!verseChallenges[verse]"
          :aria-label="`Verso ${verse}${verseResults[verse] ? ', já selecionado' : ''}`"
          @click="openVerse(verse)"
        >
          <span class="verse-number">{{ String(verse).padStart(2, "0") }}</span>
          <span class="verse-label">Verso</span>
        </button>
      </div>
    </section>

    <dialog
      ref="verseDialog"
      class="verse-dialog"
      aria-labelledby="verse-dialog-title"
      @close="closeVerseDialog"
      @click.self="verseDialog?.close()"
    >
      <button
        class="verse-dialog-close"
        type="button"
        aria-label="Fechar modal"
        @click="verseDialog?.close()"
      >
        <X :size="18" :stroke-width="2" />
      </button>
      <section v-if="currentVerse !== null" class="verse-dialog-content">
        <p class="dialog-eyebrow">JOGO DOS VERSOS</p>
        <h2 id="verse-dialog-title">Verso {{ currentVerse }}</h2>
        <audio
          ref="songAudio"
          :src="audioUrl"
          preload="metadata"
          @ended="handleAudioEnded"
          @error="handleAudioError"
        />
        <div class="verse-excerpt-box">
          <p class="verse-excerpt" aria-live="polite">{{ currentExcerpt }}</p>
          <button
            class="verse-audio-button"
            type="button"
            :aria-label="isPlaying ? 'Pausar música' : 'Tocar música'"
            @click="
              playSegment(1);
              toggleAudio();
            "
          >
            <Volume2 :size="28" :stroke-width="1.8" />
          </button>
        </div>
        <p v-if="audioError" class="verse-audio-error" role="alert">
          {{ audioError }}
        </p>
        <p v-if="selectedResult && selectedVerse" class="verse-answer">
          <strong>{{ selectedVerse.parts[0].title }}</strong>
          <span>{{ selectedVerse.parts[0].artist }}</span>
        </p>

        <div class="verse-outcomes">
          <button
            v-for="segment in [2, 3, 4]"
            :key="segment"
            class="verse-outcome-button"
            :class="{
              'is-selected': verseResults[currentVerse]?.segment === segment,
              [outcomeClass()]: verseResults[currentVerse]?.segment === segment,
            }"
            type="button"
            :aria-pressed="verseResults[currentVerse]?.segment === segment"
            @click="playSegment(segment)"
          >
            <span class="outcome-title">
              {{
                segment === 4
                  ? "Ninguém acertou"
                  : `${outcomeTeamName(segment)} acertou`
              }}
            </span>
            <span class="outcome-points">
              {{ segment === 2 ? "+3 pontos" : segment === 3 ? "+1 ponto" : "Sem pontos" }}
            </span>
          </button>
        </div>
      </section>
    </dialog>
  </GameScreen>
</template>

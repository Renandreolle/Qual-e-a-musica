<script setup lang="ts">
import { ArrowLeft, Repeat2 } from "lucide-vue-next";
import type { Team } from "../types/team";

const props = defineProps<{
  title: string;
  teams: Team[];
  activeTeamMarker?: string;
  turnSwitchDisabled?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  toggleTurn: [];
}>();

function isActiveTeam(team: Team) {
  return props.activeTeamMarker === team.marker;
}
</script>

<template>
  <section class="game-layout game-screen">
    <header class="game-topbar">
      <div
        v-for="team in teams"
        :key="team.marker"
        class="team-score"
        :class="[`team-${team.accent}`, { 'is-active': isActiveTeam(team) }]"
        :aria-label="`${team.name}, pontuação ${team.score}`"
        :aria-current="isActiveTeam(team) ? 'true' : undefined"
      >
        <div class="team-mark" aria-hidden="true">{{ team.marker }}</div>
        <div class="team-info">
          <span class="team-label">{{ team.name }}</span>
          <span class="team-points">PONTOS</span>
        </div>
        <span class="score-number">{{ String(team.score).padStart(2, "0") }}</span>
      </div>

      <div class="game-header-center">
        <img class="game-logo" src="/Qualmusica.webp" alt="Qual é a música?" />
      </div>
      <div class="game-back-zone">
        <button class="game-back-button" type="button" @click="emit('back')">
          <ArrowLeft :size="16" :stroke-width="1.8" />
          <span>Voltar</span>
        </button>
      </div>
      <div v-if="activeTeamMarker" class="game-turn-zone">
        <button
          class="game-turn-button"
          type="button"
          aria-label="Trocar equipe da vez"
          :disabled="turnSwitchDisabled"
          @click="emit('toggleTurn')"
        >
          <Repeat2 :size="16" :stroke-width="1.8" />
          <span>Trocar vez</span>
        </button>
      </div>
    </header>

    <slot>
      <div class="game-placeholder">
        <h1>{{ title }}</h1>
        <p>O conteúdo desta tela será definido depois.</p>
      </div>
    </slot>
  </section>
</template>

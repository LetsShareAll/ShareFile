<script setup lang="ts">
import AppNotifications from './components/AppNotifications.vue';
import ConfirmDialogHost from './components/ConfirmDialogHost.vue';
</script>

<template>
  <router-view />
  <AppNotifications />
  <ConfirmDialogHost />
</template>

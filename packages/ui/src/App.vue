<script setup lang="ts">
const shareFileName = __SHARE_FILE_NAME__;
</script>

<template>
  <main class="scaffold">
    <h1>ShareFile · Vue 3 脚手架</h1>
    <p>
      阶段① 工具链已就绪，数据源：<code>{{ shareFileName }}</code>
    </p>
  </main>
</template>

<style scoped>
.scaffold {
  padding: 48px;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    sans-serif;
}
</style>

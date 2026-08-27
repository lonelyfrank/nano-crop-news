<template>
  <fieldset class="checkbox-group">
    <legend v-if="label">{{ label }}</legend>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <label v-for="item in items" :key="item.id" class="checkbox-row">
      <input
        type="checkbox"
        :value="item.id"
        :checked="modelValue.includes(item.id)"
        @change="toggle(item.id)"
      >
      {{ item.name }}
    </label>
    <p v-if="!items.length" class="empty">Nessuna opzione disponibile.</p>
  </fieldset>
</template>

<script setup lang="ts">
interface Item {
  id: number
  name: string
}

const props = defineProps<{
  items: Item[]
  modelValue: number[]
  label?: string
  hint?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [number[]] }>()

function toggle(id: number) {
  const next = props.modelValue.includes(id)
    ? props.modelValue.filter((existing) => existing !== id)
    : [...props.modelValue, id]
  emit('update:modelValue', next)
}
</script>

<style scoped>
.checkbox-group {
  border: none;
  margin: 0 0 1.25rem;
  padding: 0;
}

legend {
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.4rem;
  padding: 0;
}

.hint {
  font-size: 0.78rem;
  color: var(--muted-text);
  margin: 0 0 0.5rem;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
  font-size: 0.9rem;
}

.empty {
  font-size: 0.85rem;
  color: var(--muted-text);
}
</style>

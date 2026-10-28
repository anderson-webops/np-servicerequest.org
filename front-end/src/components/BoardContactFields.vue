<script setup lang="ts">
import { boardNotificationPreferenceOptions } from '~/utils/board'
import {
  boardContactMethodOptions,
  getBoardContactValueAutocomplete,
  getBoardContactValueInputMode,
  getBoardContactValueLabel,
  getBoardContactValuePlaceholder,
  getBoardContactValueType,
  normalizeBoardContactMethod,
} from '~/utils/contact'

const props = defineProps<{
  notePlaceholder: string
  resetOn: boolean
}>()

const contactMethod = ref(normalizeBoardContactMethod('email'))
const notificationPreference = ref<'none' | 'email'>('none')

watch(
  () => props.resetOn,
  (shouldReset) => {
    if (shouldReset) {
      contactMethod.value = 'email'
      notificationPreference.value = 'none'
    }
  },
)
</script>

<template>
  <fieldset class="form-section">
    <legend>Your contact details</legend>
    <p class="form-section__note">
      Posts are public. Other visitors can reveal your contact details.
    </p>

    <div class="field-grid">
      <label class="field field--wide">
        <span class="field__label">Your name</span>
        <input
          autocomplete="name"
          name="name"
          placeholder="Jane Smith"
          required
          type="text"
        >
      </label>

      <label class="field">
        <span class="field__label">Contact method</span>
        <select v-model="contactMethod" name="contact_method" required>
          <option
            v-for="option in boardContactMethodOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="field">
        <span class="field__label">{{ getBoardContactValueLabel(contactMethod) }}</span>
        <input
          :autocomplete="getBoardContactValueAutocomplete(contactMethod)"
          :inputmode="getBoardContactValueInputMode(contactMethod)"
          :placeholder="getBoardContactValuePlaceholder(contactMethod)"
          :type="getBoardContactValueType(contactMethod)"
          name="contact_value"
          required
        >
      </label>

      <label class="field field--wide">
        <span class="field__label">Contact note <span class="field__optional">(optional)</span></span>
        <input
          name="contact_note"
          :placeholder="notePlaceholder"
          type="text"
        >
      </label>

      <label class="field">
        <span class="field__label">Reply notifications</span>
        <select v-model="notificationPreference" name="notification_preference">
          <option
            v-for="option in boardNotificationPreferenceOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label v-if="notificationPreference === 'email'" class="field">
        <span class="field__label">
          Notification email
          <span v-if="contactMethod === 'email'" class="field__optional">(optional)</span>
        </span>
        <input
          autocomplete="email"
          name="notification_email"
          :placeholder="contactMethod === 'email' ? 'Defaults to your contact email' : 'jane@email.com'"
          :required="contactMethod === 'phone'"
          type="email"
        >
      </label>
    </div>
  </fieldset>
</template>

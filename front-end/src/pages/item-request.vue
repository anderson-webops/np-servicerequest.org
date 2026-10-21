<script setup lang="ts">
import { useBoardSubmission } from '~/composables/useBoardSubmission'
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

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Request an item',
  description:
    'Post an item request to the community board for something you want to borrow, such as a tool, book, or kitchen item.',
})

const { loadBootstrap, securityError, status, submit }
  = useBoardSubmission('itemRequest')
const contactMethod = ref(normalizeBoardContactMethod('email'))
const notificationPreference = ref<'none' | 'email'>('none')

onMounted(() => {
  void loadBootstrap()
})

watch(
  () => status.success,
  (nextSuccess) => {
    if (nextSuccess) {
      contactMethod.value = 'email'
      notificationPreference.value = 'none'
    }
  },
)
</script>

<template>
  <BoardSubmissionPage
    draft-key="item-request"
    kind="item-request"
    pending-label="Posting item request..."
    :security-error="securityError"
    :status="status"
    submit-label="Post item request"
    success-text="Item request posted. If you posted with email, check it for a private management link to delete the post."
    title="Request an item"
    @submit="submit"
  >
    <label class="field">
      <span>Your name</span>
      <input
        autocomplete="name"
        name="name"
        placeholder="Jane Smith"
        required
        type="text"
      >
    </label>

    <label class="field">
      <span>Contact method</span>
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
      <span>{{ getBoardContactValueLabel(contactMethod) }}</span>
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
      <span>Contact note (optional)</span>
      <input
        name="contact_note"
        placeholder="Text first or weekdays."
        type="text"
      >
    </label>

    <label class="field">
      <span>Reply notifications</span>
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
      <span>{{ contactMethod === 'email' ? 'Notification email (optional)' : 'Notification email' }}</span>
      <input
        autocomplete="email"
        name="notification_email"
        :placeholder="contactMethod === 'email' ? 'Optional reply email' : 'jane@email.com'"
        :required="contactMethod === 'phone'"
        type="email"
      >
    </label>

    <label class="field field--wide">
      <span>Item needed</span>
      <input
        name="item_needed"
        placeholder="Axe, stock pot, cookbook, drill, folding table..."
        required
        type="text"
      >
    </label>

    <label class="field">
      <span>Need it by</span>
      <input name="needed_by" type="date">
    </label>

    <label class="field">
      <span>How long will you need it?</span>
      <input
        name="duration"
        placeholder="A day, a weekend, two weeks..."
        required
        type="text"
      >
    </label>

    <label class="field">
      <span>Pickup plan</span>
      <select name="pickup_plan" required>
        <option value="">Select one</option>
        <option>I can pick it up</option>
        <option>I may need drop-off help</option>
        <option>I am flexible</option>
      </select>
    </label>

    <label class="field">
      <span>Your neighborhood</span>
      <input
        name="neighborhood"
        required
        type="text"
      >
    </label>

    <label class="field field--wide">
      <span>Details</span>
      <textarea
        name="details"
        required
        rows="6"
      />
    </label>
  </BoardSubmissionPage>
</template>

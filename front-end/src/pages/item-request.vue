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
    description="Use this page when you want to borrow a practical item such as a tool, book, kitchen item, or ladder."
    draft-key="item-request"
    eyebrow="Request an item"
    :examples="[
      'Name the exact item if you can.',
      'Say how long you expect to borrow it.',
      'Include whether you can pick it up yourself or need help getting it.',
    ]"
    pending-label="Posting item request..."
    :security-error="securityError"
    :status="status"
    submit-label="Post item request"
    success-text="Posted. Your item request now appears on the live board. If you used an email address, a management link was sent there so you can delete it later from another browser."
    title="Ask to borrow a specific item."
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
        placeholder="Where you are located"
        required
        type="text"
      >
    </label>

    <label class="field field--wide">
      <span>Details</span>
      <textarea
        name="details"
        placeholder="Share size, edition, quantity, or use details."
        required
        rows="6"
      />
    </label>
  </BoardSubmissionPage>
</template>

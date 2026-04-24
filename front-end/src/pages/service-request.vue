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
  title: 'Request a service project',
  description:
    'Post a service project to the community board and describe the job, timing, and location so someone can respond.',
})

const { loadBootstrap, securityError, status, submit }
  = useBoardSubmission('service')
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
    description="Use this page for hands-on help such as cleanups, repairs, setup, moving help, or accessibility work."
    draft-key="service-request"
    eyebrow="Request a service project"
    :examples="[
      'Give a short title to the project.',
      'Say where the work will happen and when it is needed.',
      'Explain whether the project needs tools, lifting, transport, or a special skill.',
    ]"
    pending-label="Posting service request..."
    :security-error="securityError"
    :status="status"
    submit-label="Post service request"
    success-text="Posted. Your service project now appears on the live board. If you used an email address, a management link was sent there so you can delete it later from another browser."
    title="Describe the work, the timing, and how someone should reach you."
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
        placeholder="Text first or evenings."
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

    <label class="field">
      <span>Project type</span>
      <select name="project_type" required>
        <option value="">Select one</option>
        <option>Cleanup</option>
        <option>Repair</option>
        <option>Accessibility</option>
        <option>Moving help</option>
        <option>Setup or teardown</option>
        <option>Other</option>
      </select>
    </label>

    <label class="field">
      <span>Location or neighborhood</span>
      <input
        autocomplete="street-address"
        name="location"
        placeholder="Where the project is happening"
        required
        type="text"
      >
    </label>

    <label class="field field--wide">
      <span>Timing</span>
      <input
        name="timing"
        placeholder="Saturday morning or next week"
        required
        type="text"
      >
    </label>

    <label class="field field--wide">
      <span>Project details</span>
      <textarea
        name="details"
        placeholder="Explain the work, supplies, and anything responders should know."
        required
        rows="6"
      />
    </label>
  </BoardSubmissionPage>
</template>

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
  title: 'Volunteer an item to lend',
  description:
    'Post an item lending offer to the community board so neighbors can ask to borrow something you have available.',
})

const { loadBootstrap, securityError, status, submit }
  = useBoardSubmission('itemLending')
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
    description="Use this page to offer an item that someone else can borrow."
    draft-key="item-lending"
    eyebrow="Volunteer an item to lend"
    :examples="[
      'Say what the item is and what condition it is in.',
      'Explain any borrowing rules, pickup limits, or return expectations.',
      'Let people know the neighborhood and how to reach you.',
    ]"
    pending-label="Posting lending offer..."
    :security-error="securityError"
    :status="status"
    submit-label="Post lending offer"
    success-text="Posted. Your lending offer now appears on the live board. If you used an email address, a management link was sent there so you can delete it later from another browser."
    title="Offer an item to lend."
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
        placeholder="Text first or porch pickup."
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
      <span>Item available to lend</span>
      <input
        name="item_available"
        placeholder="Cordless drill, bundt pan, pruning shears, history book set..."
        required
        type="text"
      >
    </label>

    <label class="field">
      <span>Neighborhood</span>
      <input
        name="neighborhood"
        placeholder="Where pickup can happen"
        required
        type="text"
      >
    </label>

    <label class="field">
      <span>Availability</span>
      <input
        name="availability"
        placeholder="Weeknights, weekends, most afternoons..."
        required
        type="text"
      >
    </label>

    <label class="field">
      <span>Condition or notes</span>
      <input
        name="condition"
        placeholder="New, gently used, heavy, fragile..."
        required
        type="text"
      >
    </label>

    <label class="field field--wide">
      <span>Borrowing guidelines</span>
      <textarea
        name="guidelines"
        placeholder="List borrowing limits, pickup notes, and return expectations."
        required
        rows="6"
      />
    </label>
  </BoardSubmissionPage>
</template>

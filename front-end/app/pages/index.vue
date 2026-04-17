<script setup lang="ts">
definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Request help, borrow items, and lend what you can',
  description: 'Request a service project, ask to borrow a household item, or lend tools, books, and kitchen gear to neighbors.',
})

const route = useRoute()

const submitted = computed(() => {
  const value = route.query.submitted
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const processSteps = [
  {
    number: '01',
    title: 'Choose the right board',
    description: 'Use the project form for volunteer help, the request form for things you need to borrow, and the lending form for items you can share.',
  },
  {
    number: '02',
    title: 'Add the details someone needs',
    description: 'Include what you need, when you need it, and the best way to contact you so follow-up is quick and direct.',
  },
  {
    number: '03',
    title: 'Make the connection',
    description: 'Once someone can help, they can reach out and coordinate timing, pickup, drop-off, or project scope with you directly.',
  },
]

const boardGroups = [
  {
    title: 'Service projects',
    items: ['yard cleanup', 'small repairs', 'moving help', 'accessibility upgrades', 'setup or teardown'],
  },
  {
    title: 'Borrow requests',
    items: ['axes and hand tools', 'kitchen utensils', 'books', 'ladders', 'seasonal gear'],
  },
  {
    title: 'Items to lend',
    items: ['power tools', 'cookware', 'study materials', 'gardening supplies', 'one-off specialty items'],
  },
]
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero__inner">
        <div class="hero__copy">
          <p class="eyebrow">
            One shared place for community requests
          </p>
          <h1>
            Ask for help, borrow what you need, and lend what you can.
          </h1>
          <p class="hero__lede">
            This site gives neighbors three clear ways to connect: request a service project, ask to borrow an item, or volunteer something useful for someone else to use.
          </p>

          <div class="hero__actions">
            <a href="#service-request">Request a service project</a>
            <a href="#item-request">Request an item</a>
            <a href="#item-lending">Volunteer an item</a>
          </div>

          <p class="hero__caption">
            Best for short-term projects, practical household needs, and lending tools, books, and kitchen gear.
          </p>
        </div>

        <div aria-hidden="true" class="hero__board">
          <div class="board">
            <div class="board__halo" />
            <div class="board__note board__note--service">
              <span>service projects</span>
            </div>
            <div class="board__note board__note--request">
              <span>borrow an item</span>
            </div>
            <div class="board__note board__note--lend">
              <span>lend what you have</span>
            </div>
            <div class="board__ring">
              <strong>shared shelf</strong>
              <small>tools, books, kitchen gear, project help</small>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="process">
      <div class="section-heading">
        <p class="eyebrow">
          How it works
        </p>
        <h2>
          Simple routing keeps the board easy to scan and easy to answer.
        </h2>
      </div>

      <ol class="process__list">
        <li v-for="step in processSteps" :key="step.number">
          <span class="process__number">{{ step.number }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="board-groups">
      <div class="section-heading">
        <p class="eyebrow">
          What belongs here
        </p>
        <h2>
          Keep requests practical, specific, and easy for another person to respond to.
        </h2>
      </div>

      <div class="board-groups__grid">
        <article v-for="group in boardGroups" :key="group.title">
          <h3>{{ group.title }}</h3>
          <ul>
            <li v-for="item in group.items" :key="item">
              {{ item }}
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section id="service-request" class="intake intake--service">
      <div class="intake__copy">
        <p class="eyebrow">
          Request a service project
        </p>
        <h2>
          Describe the job, the timing, and the best way for someone to reach you.
        </h2>
        <p>
          Use this for hands-on help: cleanups, repair tasks, home setup, small moves, accessibility work, or any project that needs volunteer time.
        </p>

        <ul class="intake__examples">
          <li>Give a short title to the project.</li>
          <li>Say where the work will happen and when it is needed.</li>
          <li>Explain whether the project needs tools, lifting, transport, or a special skill.</li>
        </ul>

        <p v-if="submitted === 'service'" class="success-note">
          Thank you. Your service project request is ready for follow-up.
        </p>
      </div>

      <form
        action="/?submitted=service#service-request"
        class="intake__form"
        data-netlify="true"
        method="POST"
        name="service-request"
        netlify-honeypot="bot-field"
      >
        <input name="form-name" type="hidden" value="service-request">
        <p class="sr-only">
          <label>Do not fill this field if you are human. <input name="bot-field" type="text"></label>
        </p>

        <div class="field-grid">
          <label class="field">
            <span>Your name</span>
            <input autocomplete="name" name="name" placeholder="Jane Smith" required type="text">
          </label>

          <label class="field">
            <span>Email or phone</span>
            <input autocomplete="email" name="contact" placeholder="jane@email.com or 555-123-4567" required type="text">
          </label>

          <label class="field">
            <span>Project type</span>
            <select name="project_type" required>
              <option value="">
                Select one
              </option>
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
            <input autocomplete="street-address" name="location" placeholder="Where the project is happening" required type="text">
          </label>

          <label class="field field--wide">
            <span>Timing</span>
            <input name="timing" placeholder="Example: Saturday morning or sometime next week" required type="text">
          </label>

          <label class="field field--wide">
            <span>Project details</span>
            <textarea name="details" placeholder="Explain what needs to be done, what supplies are already available, and anything someone should know before responding." required rows="6" />
          </label>
        </div>

        <button class="submit-button" type="submit">
          Send service request
        </button>
      </form>
    </section>

    <section id="item-request" class="intake intake--request">
      <div class="intake__copy">
        <p class="eyebrow">
          Request an item
        </p>
        <h2>
          Ask for something specific that you want to borrow.
        </h2>
        <p>
          This is the place for practical item requests such as an axe, a kitchen utensil, a certain book, a ladder, or another short-term household need.
        </p>

        <ul class="intake__examples">
          <li>Name the exact item if you can.</li>
          <li>Say how long you expect to borrow it.</li>
          <li>Include whether you can pick it up yourself or need help getting it.</li>
        </ul>

        <p v-if="submitted === 'item-request'" class="success-note">
          Thank you. Your item request is ready for someone to respond to.
        </p>
      </div>

      <form
        action="/?submitted=item-request#item-request"
        class="intake__form"
        data-netlify="true"
        method="POST"
        name="item-request"
        netlify-honeypot="bot-field"
      >
        <input name="form-name" type="hidden" value="item-request">
        <p class="sr-only">
          <label>Do not fill this field if you are human. <input name="bot-field" type="text"></label>
        </p>

        <div class="field-grid">
          <label class="field">
            <span>Your name</span>
            <input autocomplete="name" name="name" placeholder="Jane Smith" required type="text">
          </label>

          <label class="field">
            <span>Email or phone</span>
            <input autocomplete="email" name="contact" placeholder="jane@email.com or 555-123-4567" required type="text">
          </label>

          <label class="field field--wide">
            <span>Item needed</span>
            <input name="item_needed" placeholder="Axe, stock pot, cookbook, drill, folding table..." required type="text">
          </label>

          <label class="field">
            <span>Need it by</span>
            <input name="needed_by" type="date">
          </label>

          <label class="field">
            <span>How long will you need it?</span>
            <input name="duration" placeholder="A day, a weekend, two weeks..." required type="text">
          </label>

          <label class="field">
            <span>Pickup plan</span>
            <select name="pickup_plan" required>
              <option value="">
                Select one
              </option>
              <option>I can pick it up</option>
              <option>I may need drop-off help</option>
              <option>I am flexible</option>
            </select>
          </label>

          <label class="field">
            <span>Your neighborhood</span>
            <input name="neighborhood" placeholder="Where you are located" required type="text">
          </label>

          <label class="field field--wide">
            <span>Details</span>
            <textarea name="details" placeholder="Share any size, edition, quantity, or use-case details that would help a lender know whether they have the right item." required rows="6" />
          </label>
        </div>

        <button class="submit-button" type="submit">
          Send item request
        </button>
      </form>
    </section>

    <section id="item-lending" class="intake intake--lend">
      <div class="intake__copy">
        <p class="eyebrow">
          Volunteer an item to lend
        </p>
        <h2>
          Offer something useful so another person can reach out and borrow it.
        </h2>
        <p>
          List items you are willing to share, from tools and kitchen utensils to books and specialty equipment, so people know who to contact.
        </p>

        <ul class="intake__examples">
          <li>Say what the item is and what condition it is in.</li>
          <li>Explain any borrowing rules, pickup limits, or return expectations.</li>
          <li>Let people know the neighborhood and how to reach you.</li>
        </ul>

        <p v-if="submitted === 'item-lending'" class="success-note">
          Thank you. Your lending offer is ready for interested neighbors to review.
        </p>
      </div>

      <form
        action="/?submitted=item-lending#item-lending"
        class="intake__form"
        data-netlify="true"
        method="POST"
        name="item-lending"
        netlify-honeypot="bot-field"
      >
        <input name="form-name" type="hidden" value="item-lending">
        <p class="sr-only">
          <label>Do not fill this field if you are human. <input name="bot-field" type="text"></label>
        </p>

        <div class="field-grid">
          <label class="field">
            <span>Your name</span>
            <input autocomplete="name" name="name" placeholder="Jane Smith" required type="text">
          </label>

          <label class="field">
            <span>Email or phone</span>
            <input autocomplete="email" name="contact" placeholder="jane@email.com or 555-123-4567" required type="text">
          </label>

          <label class="field field--wide">
            <span>Item available to lend</span>
            <input name="item_available" placeholder="Cordless drill, bundt pan, pruning shears, history book set..." required type="text">
          </label>

          <label class="field">
            <span>Neighborhood</span>
            <input name="neighborhood" placeholder="Where pickup can happen" required type="text">
          </label>

          <label class="field">
            <span>Availability</span>
            <input name="availability" placeholder="Weeknights, weekends, most afternoons..." required type="text">
          </label>

          <label class="field">
            <span>Condition or notes</span>
            <input name="condition" placeholder="New, gently used, heavy, fragile..." required type="text">
          </label>

          <label class="field field--wide">
            <span>Borrowing guidelines</span>
            <textarea name="guidelines" placeholder="Let people know how long they can borrow the item, whether you need a text before pickup, and anything else they should respect." required rows="6" />
          </label>
        </div>

        <button class="submit-button" type="submit">
          Share this item
        </button>
      </form>
    </section>

    <section class="closing-note">
      <p class="eyebrow">
        Keep it practical
      </p>
      <h2>
        Clear descriptions make it easier for the right person to step in.
      </h2>
      <p>
        If your request does not fit perfectly into one category, choose the closest form and explain the situation clearly so someone can follow up.
      </p>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  padding-bottom: 2rem;
}

.hero,
.process,
.board-groups,
.intake,
.closing-note {
  padding-inline: 5vw;
}

.hero {
  position: relative;
  padding-top: 2rem;
}

.hero__inner {
  min-height: calc(100svh - 7rem);
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(300px, 0.95fr);
  align-items: center;
  gap: 4rem;
}

.hero__copy {
  max-width: 38rem;
  animation: rise-in 700ms ease both;
}

.eyebrow {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6d7267;
}

.hero h1,
.section-heading h2,
.intake__copy h2,
.closing-note h2 {
  margin: 0;
  font-family: 'DM Serif Display', serif;
  font-weight: 400;
  letter-spacing: -0.03em;
  color: #162219;
}

.hero h1 {
  max-width: 11ch;
  font-size: clamp(3.3rem, 7vw, 6.8rem);
  line-height: 0.94;
}

.hero__lede,
.intake__copy p,
.closing-note p,
.process__list p,
.board-groups li {
  color: #33433a;
  line-height: 1.7;
}

.hero__lede {
  max-width: 33rem;
  margin: 1.35rem 0 0;
  font-size: 1.12rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-top: 2rem;
}

.hero__actions a,
.submit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3.35rem;
  padding: 0.95rem 1.3rem;
  border: 0;
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.98rem;
  font-weight: 700;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    color 180ms ease;
}

.hero__actions a:nth-child(1),
.submit-button {
  background: #294635;
  color: #f8f4eb;
  box-shadow: 0 16px 32px rgba(41, 70, 53, 0.18);
}

.hero__actions a:nth-child(2) {
  background: rgba(206, 118, 77, 0.12);
  color: #7a3119;
}

.hero__actions a:nth-child(3) {
  background: rgba(41, 70, 53, 0.08);
  color: #1d2d23;
}

.hero__actions a:hover,
.hero__actions a:focus-visible,
.submit-button:hover,
.submit-button:focus-visible {
  transform: translateY(-2px);
}

.hero__caption {
  margin: 1.35rem 0 0;
  max-width: 31rem;
  font-size: 0.96rem;
  color: #55635a;
}

.hero__board {
  display: flex;
  justify-content: center;
  animation: rise-in 850ms ease 120ms both;
}

.board {
  position: relative;
  display: grid;
  place-items: center;
  width: min(36rem, 100%);
  aspect-ratio: 1 / 1;
}

.board__halo {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(249, 245, 236, 0.9),
    rgba(249, 245, 236, 0.2) 55%,
    transparent 72%
  );
}

.board__ring {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.65rem;
  width: 56%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: radial-gradient(circle at top, rgba(255, 255, 255, 0.92), rgba(246, 239, 224, 0.96));
  border: 1px solid rgba(22, 34, 25, 0.08);
  box-shadow:
    inset 0 0 0 28px rgba(41, 70, 53, 0.06),
    0 22px 50px rgba(30, 42, 34, 0.12);
  text-align: center;
}

.board__ring strong {
  max-width: 8ch;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(1.8rem, 3vw, 2.7rem);
  font-weight: 400;
  line-height: 0.95;
}

.board__ring small {
  max-width: 13rem;
  font-size: 0.9rem;
  line-height: 1.55;
  color: #55635a;
}

.board__note {
  position: absolute;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 12rem;
  min-height: 3.6rem;
  padding: 0.85rem 1.25rem;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: lowercase;
  box-shadow: 0 16px 30px rgba(30, 42, 34, 0.12);
  animation: drift 7s ease-in-out infinite;
}

.board__note--service {
  top: 10%;
  left: 11%;
  background: #284434;
  color: #f8f3ea;
}

.board__note--request {
  right: 6%;
  top: 32%;
  background: #ffffff;
  color: #213026;
  animation-delay: 1.2s;
}

.board__note--lend {
  left: 16%;
  bottom: 12%;
  background: #d97d57;
  color: #fff7f0;
  animation-delay: 2.4s;
}

.section-heading {
  max-width: 48rem;
}

.section-heading h2,
.intake__copy h2,
.closing-note h2 {
  font-size: clamp(2rem, 4vw, 3.2rem);
  line-height: 1.02;
}

.process__list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
  margin: 2rem 0 0;
  padding: 0;
  list-style: none;
}

.process__list li,
.board-groups__grid article {
  display: grid;
  gap: 0.8rem;
  padding: 1.5rem 0 0;
  border-top: 1px solid rgba(30, 42, 34, 0.12);
}

.process__number {
  font-family: 'DM Mono', monospace;
  font-size: 0.85rem;
  letter-spacing: 0.18em;
  color: #8b8f87;
}

.process__list h3,
.board-groups__grid h3 {
  margin: 0;
  font-size: 1.18rem;
  color: #18231b;
}

.process__list p,
.board-groups__grid ul {
  margin: 0;
}

.board-groups__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.board-groups__grid ul {
  padding: 0;
  list-style: none;
}

.board-groups li + li {
  margin-top: 0.55rem;
}

.intake {
  scroll-margin-top: 7.5rem;
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 2rem;
  align-items: start;
  padding-top: 2.25rem;
  padding-bottom: 2.25rem;
  border-radius: 2rem;
  margin-inline: 5vw;
}

.intake--service {
  background: linear-gradient(135deg, rgba(244, 238, 224, 0.9), rgba(255, 255, 255, 0.75));
}

.intake--request {
  background: linear-gradient(135deg, rgba(247, 230, 221, 0.92), rgba(255, 255, 255, 0.74));
}

.intake--lend {
  background: linear-gradient(135deg, rgba(227, 238, 229, 0.92), rgba(255, 255, 255, 0.76));
}

.intake__copy {
  padding: 1.25rem 0 1.25rem 2.2rem;
}

.intake__copy p {
  margin: 1rem 0 0;
  max-width: 33rem;
}

.intake__examples {
  margin: 1.35rem 0 0;
  padding: 0;
  list-style: none;
}

.intake__examples li {
  position: relative;
  padding-left: 1.25rem;
  color: #33433a;
  line-height: 1.65;
}

.intake__examples li + li {
  margin-top: 0.7rem;
}

.intake__examples li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.8rem;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #d97d57;
}

.intake__form {
  padding: 2rem;
  border: 1px solid rgba(30, 42, 34, 0.08);
  border-radius: 1.6rem;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 42px rgba(30, 42, 34, 0.08);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.55rem;
}

.field--wide {
  grid-column: 1 / -1;
}

.field span {
  font-size: 0.9rem;
  font-weight: 700;
  color: #223026;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border: 1px solid rgba(34, 48, 38, 0.14);
  border-radius: 1rem;
  background: rgba(251, 248, 242, 0.94);
  padding: 0.95rem 1rem;
  font: inherit;
  color: #1d2d23;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.field textarea {
  resize: vertical;
  min-height: 11rem;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: rgba(41, 70, 53, 0.5);
  box-shadow: 0 0 0 4px rgba(41, 70, 53, 0.08);
  background: #fffdf9;
}

.submit-button {
  margin-top: 1.2rem;
  width: 100%;
  cursor: pointer;
}

.success-note {
  display: inline-flex;
  align-items: center;
  margin-top: 1.35rem;
  padding: 0.8rem 1rem;
  border-radius: 999px;
  background: rgba(41, 70, 53, 0.08);
  color: #213127;
  font-weight: 700;
}

.closing-note {
  max-width: 52rem;
  padding-top: 1rem;
}

.closing-note p:last-child {
  margin-top: 1rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes drift {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-8px);
  }
}

@media (max-width: 1040px) {
  .hero__inner,
  .intake {
    grid-template-columns: 1fr;
  }

  .hero__inner {
    min-height: auto;
    gap: 2.5rem;
    padding-bottom: 1rem;
  }

  .hero__copy {
    max-width: none;
  }

  .board {
    max-width: 34rem;
  }

  .intake {
    gap: 1rem;
  }

  .intake__copy {
    padding: 1.5rem 1.8rem 0;
  }
}

@media (max-width: 760px) {
  .hero,
  .process,
  .board-groups,
  .intake,
  .closing-note {
    padding-inline: 1.25rem;
  }

  .hero {
    padding-top: 1rem;
  }

  .hero h1 {
    font-size: clamp(2.7rem, 16vw, 4.6rem);
  }

  .hero__lede {
    font-size: 1rem;
  }

  .hero__actions,
  .field-grid,
  .process__list,
  .board-groups__grid {
    grid-template-columns: 1fr;
  }

  .hero__actions a,
  .submit-button {
    width: 100%;
  }

  .board__note {
    min-width: 10rem;
    font-size: 0.9rem;
  }

  .board__note--service {
    left: 3%;
  }

  .board__note--request {
    right: 1%;
    top: 28%;
  }

  .board__note--lend {
    left: 5%;
  }

  .intake {
    margin-inline: 1.25rem;
    padding-top: 1.35rem;
    padding-bottom: 1.35rem;
  }

  .intake__copy,
  .intake__form {
    padding-inline: 1.15rem;
  }

  .intake__form {
    padding-top: 1.35rem;
    padding-bottom: 1.35rem;
  }
}
</style>

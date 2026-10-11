export const metadata = { title: 'Privacy — Oromax omsref' }

// Public privacy notice for the Google sign-in consent screen (linked from Google Cloud branding).
export default function Privacy() {
  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 20px', lineHeight: 1.6, fontSize: 15 }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>omsref privacy notice</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Oromax NSW — internal practice analytics tool. Last updated October 2026.</p>

      <h2 style={{ fontSize: 17 }}>Who uses this tool</h2>
      <p>omsref is used only by authorised Oromax NSW staff. It is not offered to the public or to patients.</p>

      <h2 style={{ fontSize: 17 }}>Google account data</h2>
      <p>
        When an authorised staff member connects the practice’s Google Business Profile, omsref requests the
        <code> business.manage</code> permission to read reviews of the practice’s own business locations and to post
        replies that a staff member has approved. We also read the connecting account’s email address to show which
        account is connected.
      </p>
      <ul>
        <li>We store review star ratings, review text, dates and our replies. Reviewer names and profile photos are not stored.</li>
        <li>The Google access token is stored encrypted and is used only for these purposes.</li>
        <li>Data is not sold, shared with third parties for advertising, or used for any purpose other than the practice’s own service-quality reporting and replies.</li>
        <li>Review text may be processed by an AI service (Anthropic) to group feedback into themes and draft replies; it is not used to train their models under our agreement.</li>
      </ul>
      <p>
        Use of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        including the Limited Use requirements.
      </p>

      <h2 style={{ fontSize: 17 }}>Disconnecting and deletion</h2>
      <p>
        The connection can be removed at any time from the tool or from your Google Account’s security settings.
        To request deletion of stored data, contact the practice.
      </p>

      <h2 style={{ fontSize: 17 }}>Contact</h2>
      <p>Oromax NSW — <a href="mailto:tomjaunay@oromaxnsw.com.au">tomjaunay@oromaxnsw.com.au</a></p>
    </main>
  )
}

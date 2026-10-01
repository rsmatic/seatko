import { Link } from 'react-router-dom';
import { SEATKO_LOGO } from '../api.js';

// Contact for privacy and account questions; shown publicly on these pages.
const CONTACT = 'rsmatic.dev@gmail.com';
const EFFECTIVE = 'October 2, 2026';

function LegalShell({ title, children }) {
  return (
    <div className="legal">
      <header className="legal-head">
        <Link to="/" className="legal-brand"><img src={SEATKO_LOGO} alt="" /> SeatKo</Link>
        <nav className="small">
          <Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link>
        </nav>
      </header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="muted">Effective {EFFECTIVE}</p>
        {children}
        <hr />
        <p className="muted small">Questions? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </article>
    </div>
  );
}

export function Terms() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        SeatKo (&ldquo;SeatKo&rdquo;, &ldquo;we&rdquo;) is a ticketing management service for event organizers. These terms apply to
        organizers who use SeatKo, their staff, and people who receive tickets issued through SeatKo. By using SeatKo you agree to them.
      </p>

      <h2>1. Accounts</h2>
      <ul>
        <li>SeatKo creates an account for each organizer and its first admin. The organizer&rsquo;s admins can then add their own staff.</li>
        <li>Organizers are responsible for everything done with their accounts, for choosing who gets access, and for keeping passwords secret.</li>
        <li>Tell us right away at {CONTACT} if you think an account was used without permission.</li>
      </ul>

      <h2>2. What organizers are responsible for</h2>
      <ul>
        <li>Accurate event details, prices and seating, and actually holding the event as advertised.</li>
        <li>Collecting payment from ticket buyers, and handling refunds, cancellations and complaints from buyers.</li>
        <li>Getting any permits and following the laws that apply to their events, including the Data Privacy Act for buyer information they collect.</li>
        <li>Not using SeatKo for fraudulent, illegal or misleading events, or to send spam.</li>
      </ul>

      <h2>3. Tickets and buyers</h2>
      <ul>
        <li>A ticket is an agreement between the buyer and the organizer. SeatKo provides the system but is not a party to that agreement and does not sell tickets itself.</li>
        <li>Each ticket has a unique QR code that can be scanned once. Anyone holding the code can use it, so buyers should keep their ticket private.</li>
        <li>Questions about an event, refunds or changes should go to the organizer.</li>
      </ul>

      <h2>4. Fees and payment</h2>
      <ul>
        <li>Organizers pay SeatKo according to the billing terms agreed with them, which are shown on their Billing page (for example a fee per ticket, per event or per month).</li>
        <li>Payments are made by GCash or bank transfer and count once SeatKo confirms them.</li>
        <li>Ticket fees for refunded orders are credited back automatically. Other fees already charged are not refundable unless we agree otherwise.</li>
        <li>We may suspend an organizer with an unpaid balance after letting them know. Tickets already issued keep working while an account is suspended.</li>
        <li>We will tell organizers before changing their billing terms. Changes apply only from that point on.</li>
      </ul>

      <h2>5. Suspension and ending the service</h2>
      <ul>
        <li>We may suspend or close an account that breaks these terms, is used for fraud, or puts other users at risk.</li>
        <li>Organizers can stop using SeatKo at any time by telling us. Any unpaid balance remains due.</li>
        <li>Before an account is closed, organizers can export their attendee lists. We delete the account&rsquo;s data as described in the Privacy Policy.</li>
      </ul>

      <h2>6. Organizer data</h2>
      <p>
        Organizers own their event and buyer information. SeatKo stores and processes it only to run the service for them, as described in
        the <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>7. Availability</h2>
      <p>
        We work to keep SeatKo running and secure, but it is provided &ldquo;as is&rdquo;, without a guarantee that it will always be available or
        error-free. We recommend exporting the attendee list (CSV) before each event as a backup for the gate.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the extent allowed by law, SeatKo is not liable for indirect or consequential losses, such as lost ticket sales or event costs.
        Our total liability to an organizer is limited to the fees that organizer paid SeatKo in the three months before the claim.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>We may update these terms. We will tell organizers about important changes, and the date above will change.</p>

      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of the Republic of the Philippines.</p>
    </LegalShell>
  );
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This policy explains how SeatKo handles personal information, in line with the Data Privacy Act of 2012 (Republic Act No. 10173)
        and its implementing rules.
      </p>

      <h2>1. Who is responsible for your data</h2>
      <ul>
        <li><strong>If you bought or received a ticket:</strong> the event organizer decides what information is collected about you and why. They are the personal information controller. SeatKo stores and processes that information for the organizer as a personal information processor.</li>
        <li><strong>If you are an organizer or staff member:</strong> SeatKo is responsible for your account information.</li>
      </ul>

      <h2>2. Information we handle</h2>
      <ul>
        <li><strong>Ticket buyers:</strong> name, and optionally email and phone number; the event, seat or ticket type and price; payment method and reference entered by the organizer; ticket code; and when the ticket was checked in.</li>
        <li><strong>Organizer staff:</strong> name, email, role, an encrypted (hashed) password, sign-in times, and a log of actions taken in SeatKo (such as sales, refunds and check-ins).</li>
        <li><strong>Organizer billing:</strong> amounts owed and paid, payment references and the payment screenshots organizers upload.</li>
        <li><strong>Technical data:</strong> our servers keep basic request logs (such as IP address and browser type) for security and troubleshooting.</li>
      </ul>
      <p>We do not collect card numbers or bank login details. Payments for tickets happen between the buyer and the organizer.</p>

      <h2>3. How the information is used</h2>
      <ul>
        <li>To issue tickets, check them at the entrance, and show organizers their sales and attendance.</li>
        <li>To bill organizers for SeatKo and confirm their payments.</li>
        <li>To keep the service secure, prevent fraud, and give support.</li>
      </ul>
      <p>We do not sell personal information and do not use it for advertising.</p>

      <h2>4. Who can see it</h2>
      <ul>
        <li>Buyer information is visible only to the organizer of that event and its staff, and to SeatKo when needed to run or support the service.</li>
        <li>Anyone with a ticket link or code can view that ticket (event, seat and holder name), which is how buyers receive their tickets.</li>
        <li>Our hosting providers store the data for us: Amazon Web Services (servers located in the United States) and GitHub Pages (the web app). The web app also loads fonts from Google Fonts.</li>
        <li>We may disclose information if required by law or a valid government order.</li>
      </ul>

      <h2>5. How it is protected</h2>
      <ul>
        <li>All connections use HTTPS. Passwords are stored only as secure hashes.</li>
        <li>Each organizer can only see its own data. Payment screenshots are private to the organizer and SeatKo.</li>
        <li>Access to the servers is limited to SeatKo.</li>
      </ul>

      <h2>6. How long it is kept</h2>
      <p>
        Information is kept while the organizer uses SeatKo. When an organizer closes their account, or asks us to, we delete their events,
        tickets and buyer information within 30 days, except billing records we need to keep for accounting.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Under the Data Privacy Act you have the right to be informed, to access, to correct, to object, to have your data erased or blocked,
        to data portability, and to file a complaint with the National Privacy Commission (privacy.gov.ph).
      </p>
      <p>
        Ticket buyers should first contact the organizer of their event, since the organizer controls that information. You can also email
        us at {CONTACT} and we will help or forward your request.
      </p>

      <h2>8. Browser storage</h2>
      <p>
        SeatKo keeps your sign-in session in your browser&rsquo;s local storage. We do not use advertising or tracking cookies.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>We may update this policy. Important changes will be announced to organizers, and the date above will change.</p>
    </LegalShell>
  );
}

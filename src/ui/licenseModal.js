export class LicenseModal {
  constructor() {
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'search-backdrop';
    this._backdrop.innerHTML = `
      <div class="help-modal">
        <div class="help-header">
          <span class="help-title">License</span>
          <button class="help-close btn-link">✕ close</button>
        </div>
        <div class="license-body">
          <p>
            The Wandering Monstrum is an independent product published under the
            Shadowdark RPG Third-Party License and is not affiliated with The Arcane Library,
            LLC. Shadowdark RPG © 2023 The Arcane Library, LLC.
          </p>
          <h3>Unnatural Selection</h3>
          <p>
            The Wandering Monstrum includes monsters from <em>Unnatural Selection</em>,
            a supplement for Shadowdark RPG created by the
            <a href="https://dungeondamsel.com/" target="_blank" rel="noopener">Dungeon Damsel</a>.
            <em>Unnatural Selection</em> features a menagerie of wonderfully weird and dangerous
            creatures designed to surprise and delight players and game masters alike.
          </p>
          <p>
            If you enjoy the monsters you find here, we encourage you to visit
            <a href="https://dungeondamsel.com/" target="_blank" rel="noopener">dungeondamsel.com</a>
            and support the Dungeon Damsel's work directly.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(this._backdrop);

    this._backdrop.addEventListener('click', e => {
      if (e.target === this._backdrop) this.close();
    });
    this._backdrop.querySelector('.help-close').addEventListener('click', () => this.close());
  }

  open()  { this._backdrop.classList.add('open'); }
  close() { this._backdrop.classList.remove('open'); }
  isOpen() { return this._backdrop.classList.contains('open'); }
}

const SHORTCUTS = [
  { key: '/',       desc: 'Open monster search' },
  { key: 'g',       desc: 'Generate encounter' },
  { key: 'r',       desc: 'Single random monster' },
  { key: 's',       desc: 'Toggle sources panel' },
  { key: 'c',       desc: 'Copy encounter to clipboard' },
  { key: '1 – 9',   desc: 'Set encounter size (1–9)' },
  { key: '0',       desc: 'Set encounter size to 10' },
  { key: '?',       desc: 'Show this help' },
  { key: 'Esc',     desc: 'Close any open panel' },
];

export class HelpModal {
  constructor(onLicense) {
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'search-backdrop';
    this._backdrop.innerHTML = `
      <div class="help-modal">
        <div class="help-header">
          <span class="help-title">Keyboard Shortcuts</span>
          <button class="help-close btn-link">✕ close</button>
        </div>
        <table class="help-table">
          ${SHORTCUTS.map(s => `
            <tr>
              <td><kbd>${s.key}</kbd></td>
              <td>${s.desc}</td>
            </tr>
          `).join('')}
        </table>
        <div class="help-footer">
          Click any monster card to use it as the encounter seed.
          <button class="btn-link" id="help-license-link">License &amp; credits</button>
        </div>
      </div>
    `;

    document.body.appendChild(this._backdrop);

    this._backdrop.addEventListener('click', e => {
      if (e.target === this._backdrop) this.close();
    });
    this._backdrop.querySelector('.help-close').addEventListener('click', () => this.close());
    this._backdrop.querySelector('#help-license-link').addEventListener('click', () => onLicense?.());
  }

  open()  { this._backdrop.classList.add('open'); }
  close() { this._backdrop.classList.remove('open'); }
  isOpen() { return this._backdrop.classList.contains('open'); }
}

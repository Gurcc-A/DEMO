// Bee Tasty Story - Interactive Scripts

document.addEventListener('DOMContentLoaded', function () {
  // 1. Autumn special picker on index.html
  const picks = [
    { label: "Фісташкове латте", desc: "Кава, молоко та фісташка. Осінь у чашці.", price: "90 / 100 ₴" },
    { label: "Фісташковий торт", desc: "Солодка новинка у вітрині, з фісташкою.", price: "[ціна] ₴" }
  ];

  const autumnTabButtons = document.querySelectorAll('#autumn-tabs .tab-btn');
  const pickTitle = document.getElementById('pick-title');
  const pickDesc = document.getElementById('pick-desc');
  const pickPrice = document.getElementById('pick-price');

  if (autumnTabButtons.length > 0 && pickTitle) {
    autumnTabButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        autumnTabButtons.forEach(b => {
          b.style.background = 'transparent';
          b.style.color = '#FFF6DC';
          b.classList.remove('active');
        });
        btn.style.background = '#B7CC6A';
        btn.style.color = '#17140F';
        btn.classList.add('active');

        const cur = picks[idx];
        if (cur) {
          pickTitle.textContent = cur.label;
          pickDesc.textContent = cur.desc;
          pickPrice.textContent = cur.price;
        }
      });
    });
  }

  // 2. Menu filtering on menu.html
  const chipButtons = document.querySelectorAll('#category-chips .chip-btn');
  const menuGroups = document.querySelectorAll('.menu-group');

  function filterMenu(cat) {
    chipButtons.forEach(btn => {
      if (btn.getAttribute('data-cat') === cat) {
        btn.style.background = '#17140F';
        btn.style.color = '#FFC21A';
        btn.classList.add('active');
      } else {
        btn.style.background = 'transparent';
        btn.style.color = '#17140F';
        btn.classList.remove('active');
      }
    });

    menuGroups.forEach(group => {
      const gCat = group.getAttribute('data-cat');
      if (cat === 'all' || gCat === cat) {
        group.style.display = 'block';
      } else {
        group.style.display = 'none';
      }
    });
  }

  if (chipButtons.length > 0) {
    chipButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        filterMenu(cat);
      });
    });

    // Check URL parameters (e.g. menu.html?cat=autumn)
    const urlParams = new URLSearchParams(window.location.search);
    const initialCat = urlParams.get('cat');
    if (initialCat) {
      filterMenu(initialCat);
    }
  }
});

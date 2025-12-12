// Interactive Logo Animation
document.addEventListener('DOMContentLoaded', () => {
    const interactiveLogo = document.getElementById('interactive-logo');

    if (interactiveLogo) {
        // Mouse move effect - 3D tilt
        interactiveLogo.addEventListener('mousemove', (e) => {
            const rect = interactiveLogo.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;

            interactiveLogo.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
        });

        // Reset on mouse leave
        interactiveLogo.addEventListener('mouseleave', () => {
            interactiveLogo.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
        });

        // Click animation
        interactiveLogo.addEventListener('click', () => {
            interactiveLogo.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(360deg) scale(1.2)';
            setTimeout(() => {
                interactiveLogo.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
            }, 600);
        });
    }
});

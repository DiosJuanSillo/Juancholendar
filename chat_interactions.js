// Interactive Chat Animations
document.addEventListener('DOMContentLoaded', () => {
    // Message shake on double-click
    document.addEventListener('dblclick', (e) => {
        const message = e.target.closest('.message, .bot-message, .user-message');
        if (message) {
            message.classList.add('shake');
            setTimeout(() => message.classList.remove('shake'), 300);
        }
    });

    // Table row click animation
    const handleTableRowClick = (e) => {
        const row = e.target.closest('tr');
        if (row && row.parentElement.tagName !== 'THEAD') {
            row.classList.add('clicked');
            setTimeout(() => row.classList.remove('clicked'), 400);
        }
    };

    // Observe for dynamically added tables
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    const tables = node.querySelectorAll ? node.querySelectorAll('.chat-table') : [];
                    tables.forEach(table => {
                        table.addEventListener('click', handleTableRowClick);
                    });

                    // If the node itself is a table
                    if (node.classList && node.classList.contains('chat-table')) {
                        node.addEventListener('click', handleTableRowClick);
                    }
                }
            });
        });
    });

    // Start observing chat area for new content
    const chatArea = document.getElementById('chat-messages');
    if (chatArea) {
        observer.observe(chatArea, { childList: true, subtree: true });

        // Add listeners to existing tables
        chatArea.querySelectorAll('.chat-table').forEach(table => {
            table.addEventListener('click', handleTableRowClick);
        });
    }

    // Enhanced send button animation
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            sendBtn.style.animation = 'none';
            setTimeout(() => {
                sendBtn.style.animation = '';
            }, 10);
        });
    }

    // Message hover sound effect (optional - silent by default)
    const messages = document.querySelectorAll('.message, .bot-message, .user-message');
    messages.forEach(msg => {
        msg.addEventListener('mouseenter', () => {
            // Subtle scale effect is already in CSS
            // Could add sound here if desired
        });
    });
});

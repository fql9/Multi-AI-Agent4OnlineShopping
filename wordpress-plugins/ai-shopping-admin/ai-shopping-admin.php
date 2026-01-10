<?php
/**
 * Plugin Name: AI Shopping System Control Panel
 * Description: Advanced control, monitoring, and diagnostics for Multi-AI-Agent Shopping System.
 * Version: 1.4
 * Author: Peter FU
 * Author URI: https://github.com/fql9
 */

// Block direct access
if (!defined('ABSPATH')) exit;

class AIShoppingAdmin {

    // HTTP Services
    private $agent_url;
    private $gateway_url;
    private $core_mcp_url;
    private $checkout_mcp_url;
    private $web_app_url;

    // Database Config
    private $postgres_host;
    private $postgres_port;
    private $postgres_db;
    private $postgres_user;
    private $postgres_password;
    
    private $redis_host;
    private $redis_port;

    public function __construct() {
        // Load settings
        $this->agent_url        = get_option('ai_agent_url', 'http://localhost:18003');
        $this->gateway_url      = get_option('ai_gateway_url', 'http://localhost:28000');
        $this->core_mcp_url     = get_option('ai_core_mcp_url', 'http://localhost:18001');
        $this->checkout_mcp_url = get_option('ai_checkout_mcp_url', 'http://localhost:18002');
        $this->web_app_url      = get_option('ai_web_app_url', 'http://localhost:18004');
        
        $this->postgres_host    = get_option('ai_postgres_host', 'localhost');
        $this->postgres_port    = get_option('ai_postgres_port', '15432');
        $this->postgres_db      = get_option('ai_postgres_db', 'agent_db');
        $this->postgres_user    = get_option('ai_postgres_user', 'agent');
        $this->postgres_password = get_option('ai_postgres_password', 'agent_dev_password');

        $this->redis_host       = get_option('ai_redis_host', 'localhost');
        $this->redis_port       = get_option('ai_redis_port', '26379');

        // Hooks
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_post_ai_delete_session', [$this, 'handle_delete_session']);
    }

    public function add_menu() {
        add_menu_page(
            'AI Agent Control',
            'AI Agent Control',
            'manage_options',
            'ai-agent-control',
            [$this, 'render_dashboard'],
            'dashicons-superhero',
            2
        );
    }

    public function register_settings() {
        // HTTP
        register_setting('ai_agent_settings', 'ai_agent_url');
        register_setting('ai_agent_settings', 'ai_gateway_url');
        register_setting('ai_agent_settings', 'ai_core_mcp_url');
        register_setting('ai_agent_settings', 'ai_checkout_mcp_url');
        register_setting('ai_agent_settings', 'ai_web_app_url');
        
        // DB & Redis
        register_setting('ai_agent_settings', 'ai_postgres_host');
        register_setting('ai_agent_settings', 'ai_postgres_port');
        register_setting('ai_agent_settings', 'ai_postgres_db');
        register_setting('ai_agent_settings', 'ai_postgres_user');
        register_setting('ai_agent_settings', 'ai_postgres_password');
        register_setting('ai_agent_settings', 'ai_redis_host');
        register_setting('ai_agent_settings', 'ai_redis_port');
    }

    public function render_dashboard() {
        $tab = isset($_GET['tab']) ? $_GET['tab'] : 'dashboard';
        
        ?>
        <div class="wrap">
            <h1>🚀 AI Shopping Agent Control Panel</h1>
            
            <nav class="nav-tab-wrapper">
                <a href="?page=ai-agent-control&tab=dashboard" class="nav-tab <?php echo $tab === 'dashboard' ? 'nav-tab-active' : ''; ?>">Dashboard</a>
                <a href="?page=ai-agent-control&tab=sessions" class="nav-tab <?php echo $tab === 'sessions' ? 'nav-tab-active' : ''; ?>">Session Manager</a>
                <a href="?page=ai-agent-control&tab=database" class="nav-tab <?php echo $tab === 'database' ? 'nav-tab-active' : ''; ?>">Database Explorer</a>
                <a href="?page=ai-agent-control&tab=diagnostics" class="nav-tab <?php echo $tab === 'diagnostics' ? 'nav-tab-active' : ''; ?>">Diagnostics</a>
                <a href="?page=ai-agent-control&tab=settings" class="nav-tab <?php echo $tab === 'settings' ? 'nav-tab-active' : ''; ?>">Settings</a>
            </nav>

            <div class="tab-content" style="margin-top: 20px;">
                <?php
                try {
                    switch ($tab) {
                        case 'dashboard':
                            $this->render_tab_dashboard();
                            break;
                        case 'sessions':
                            $this->render_tab_sessions();
                            break;
                        case 'database':
                            $this->render_tab_database();
                            break;
                        case 'diagnostics':
                            $this->render_tab_diagnostics();
                            break;
                        case 'settings':
                            $this->render_tab_settings();
                            break;
                        default:
                            $this->render_tab_dashboard();
                    }
                } catch (Exception $e) {
                    echo '<div class="notice notice-error"><p>Error rendering page: ' . esc_html($e->getMessage()) . '</p></div>';
                }
                ?>
            </div>
        </div>
        <?php
    }

    // --- TABS ---

    private function render_tab_dashboard() {
        // Parallel checks or sequential? Sequential for simplicity in PHP
        $agent_health    = $this->check_health($this->agent_url . '/health');
        $gateway_health  = $this->check_health($this->gateway_url . '/health');
        $core_mcp_health = $this->check_health($this->core_mcp_url . '/health');
        $checkout_health = $this->check_health($this->checkout_mcp_url . '/health');
        $web_app_health  = $this->check_http_status($this->web_app_url); 
        
        $postgres_health = $this->check_tcp($this->postgres_host, $this->postgres_port);
        $redis_health    = $this->check_tcp($this->redis_host, $this->redis_port);

        ?>
        <style>
            .ai-card { background: #fff; padding: 15px 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex: 1; min-width: 250px; border-left: 5px solid #ccc; }
            .ai-card.online { border-left-color: #46b450; }
            .ai-card.offline { border-left-color: #dc3232; }
            .ai-card h3 { margin-top: 0; margin-bottom: 10px; font-size: 1.1em; }
            .ai-grid { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; }
        </style>

        <h2>Service Status</h2>
        
        <div class="ai-grid">
            <?php $this->render_card("Python Agent (LLM)", $agent_health, "Version: " . ($agent_health['data']['version'] ?? '?')); ?>
            <?php $this->render_card("Tool Gateway", $gateway_health, "Service: " . ($gateway_health['data']['service'] ?? 'Gateway')); ?>
        </div>

        <div class="ai-grid">
             <?php $this->render_card("Core MCP Server", $core_mcp_health, "Catalog & Knowledge"); ?>
             <?php $this->render_card("Checkout MCP Server", $checkout_health, "Cart & Orders"); ?>
             <?php $this->render_card("Next.js Web App", $web_app_health, "Frontend"); ?>
        </div>

        <h2>Infrastructure Status</h2>
        <div class="ai-grid">
            <div class="ai-card <?php echo $postgres_health ? 'online' : 'offline'; ?>">
                <h3>🐘 PostgreSQL</h3>
                <p>
                    <span class="dashicons <?php echo $postgres_health ? 'dashicons-yes' : 'dashicons-no'; ?>" style="color: <?php echo $postgres_health ? '#46b450' : '#dc3232'; ?>;"></span>
                    <strong><?php echo $postgres_health ? 'Connected (TCP)' : 'Unreachable'; ?></strong>
                </p>
                <p class="description">Host: <?php echo esc_html($this->postgres_host . ':' . $this->postgres_port); ?></p>
            </div>

            <div class="ai-card <?php echo $redis_health ? 'online' : 'offline'; ?>">
                <h3>🔴 Redis</h3>
                <p>
                    <span class="dashicons <?php echo $redis_health ? 'dashicons-yes' : 'dashicons-no'; ?>" style="color: <?php echo $redis_health ? '#46b450' : '#dc3232'; ?>;"></span>
                    <strong><?php echo $redis_health ? 'Connected (TCP)' : 'Unreachable'; ?></strong>
                </p>
                <p class="description">Host: <?php echo esc_html($this->redis_host . ':' . $this->redis_port); ?></p>
            </div>
        </div>
        <?php
    }

    private function render_tab_database() {
        // 1. Check Driver
        if (!class_exists('PDO') || !in_array('pgsql', PDO::getAvailableDrivers())) {
            echo '<div class="notice notice-error"><p><strong>Error:</strong> The <code>pgsql</code> driver for PHP PDO is not installed or enabled. Please install <code>php-pgsql</code> on your server to use this feature.</p></div>';
            return;
        }

        try {
            $dsn = "pgsql:host={$this->postgres_host};port={$this->postgres_port};dbname={$this->postgres_db};";
            $pdo = new PDO($dsn, $this->postgres_user, $this->postgres_password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        } catch (PDOException $e) {
            echo '<div class="notice notice-error"><p><strong>Connection Failed:</strong> ' . esc_html($e->getMessage()) . '</p></div>';
            return;
        }

        $action = $_GET['action'] ?? 'list';
        $table  = $_GET['table'] ?? '';
        
        // Handle custom SQL execution
        if (isset($_POST['execute_sql']) && !empty($_POST['custom_sql'])) {
            $sql = stripslashes($_POST['custom_sql']);
            echo '<div style="margin-bottom: 20px; background: #fff; padding: 15px; border: 1px solid #ccd0d4; box-shadow: 0 1px 1px rgba(0,0,0,.04);">';
            echo '<h3>Query Result</h3>';
            echo '<pre style="background: #f0f0f1; padding: 10px; overflow: auto;">' . esc_html($sql) . '</pre>';
            
            try {
                // Safety warning
                if (stripos($sql, 'DROP') !== false || stripos($sql, 'DELETE') !== false || stripos($sql, 'UPDATE') !== false) {
                    echo '<p style="color: orange;">⚠️ Modification query executed.</p>';
                }

                $stmt = $pdo->query($sql);
                if ($stmt) {
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                    $this->render_table_data($rows);
                } else {
                    echo '<p>Query executed successfully (no results returned).</p>';
                }
            } catch (Exception $e) {
                echo '<p style="color: red;"><strong>Error:</strong> ' . esc_html($e->getMessage()) . '</p>';
            }
            echo '</div>';
        }

        echo '<div style="display: flex; gap: 20px;">';
        
        // Sidebar: Tables
        echo '<div style="width: 200px; flex-shrink: 0; background: #fff; border-right: 1px solid #ddd; min-height: 500px;">';
        echo '<h3 style="padding: 10px; border-bottom: 1px solid #eee; margin: 0;">Tables</h3>';
        $tables_stmt = $pdo->query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'");
        $tables = $tables_stmt->fetchAll(PDO::FETCH_COLUMN);
        
        echo '<ul style="margin: 0;">';
        foreach ($tables as $t) {
            $bg = ($table === $t) ? '#0073aa' : 'transparent';
            $color = ($table === $t) ? '#fff' : '#0073aa';
            echo "<li style='margin: 0;'><a href='?page=ai-agent-control&tab=database&action=view&table=$t' style='display: block; padding: 8px 12px; text-decoration: none; color: $color; background: $bg;'>$t</a></li>";
        }
        echo '</ul>';
        echo '</div>'; // End Sidebar

        // Main Content
        echo '<div style="flex-grow: 1; padding: 0 10px;">';
        
        // SQL Runner
        echo '<form method="post" style="margin-bottom: 20px;">';
        echo '<textarea name="custom_sql" rows="5" style="width: 100%; font-family: monospace;" placeholder="SELECT * FROM products LIMIT 10;">' . esc_textarea($_POST['custom_sql'] ?? '') . '</textarea>';
        echo '<p><input type="submit" name="execute_sql" class="button button-primary" value="Run SQL" /> <span class="description">Supports standard PostgreSQL queries.</span></p>';
        echo '</form>';

        if ($action === 'view' && $table) {
            echo "<h2>Table: $table</h2>";
            
            // Get Schema
            echo '<h3>Schema</h3>';
            $schema_sql = "SELECT column_name, data_type, is_nullable 
                           FROM information_schema.columns 
                           WHERE table_name = :table";
            $stmt = $pdo->prepare($schema_sql);
            $stmt->execute([':table' => $table]);
            $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            if ($columns) {
                echo '<table class="wp-list-table widefat fixed striped" style="margin-bottom: 20px;">';
                echo '<thead><tr><th>Column</th><th>Type</th><th>Nullable</th></tr></thead><tbody>';
                foreach ($columns as $col) {
                    echo "<tr><td>{$col['column_name']}</td><td>{$col['data_type']}</td><td>{$col['is_nullable']}</td></tr>";
                }
                echo '</tbody></table>';
            }

            // Get Data Preview
            echo '<h3>Data Preview (First 20 rows)</h3>';
            try {
                // Warning: $table is from URL, but we just verified it exists in the table list technically, 
                // but for strict safety we should use the quoted identifier.
                $quoted_table = '"' . str_replace('"', '""', $table) . '"'; 
                $data_stmt = $pdo->query("SELECT * FROM $quoted_table LIMIT 20");
                $rows = $data_stmt->fetchAll(PDO::FETCH_ASSOC);
                $this->render_table_data($rows);
            } catch (Exception $e) {
                echo '<p class="error">Error fetching data: ' . esc_html($e->getMessage()) . '</p>';
            }
        } else {
            echo '<div style="padding: 20px; background: #fff; border: 1px solid #ddd; text-align: center; color: #666;">';
            echo '<p>Select a table from the left sidebar to inspect schema and data.</p>';
            echo '</div>';
        }

        echo '</div>'; // End Main Content
        echo '</div>'; // End Flex Container
    }

    private function render_table_data($rows) {
        if (empty($rows)) {
            echo '<p>No results found.</p>';
            return;
        }

        $headers = array_keys($rows[0]);
        
        echo '<div style="overflow-x: auto;">';
        echo '<table class="wp-list-table widefat fixed striped">';
        echo '<thead><tr>';
        foreach ($headers as $h) echo "<th>" . esc_html($h) . "</th>";
        echo '</tr></thead>';
        
        echo '<tbody>';
        foreach ($rows as $row) {
            echo '<tr>';
            foreach ($row as $val) {
                // Truncate long values
                $display = is_string($val) && strlen($val) > 100 ? substr($val, 0, 100) . '...' : $val;
                echo "<td>" . esc_html($display) . "</td>";
            }
            echo '</tr>';
        }
        echo '</tbody></table>';
        echo '</div>';
        echo '<p class="description">Showing ' . count($rows) . ' rows.</p>';
    }

    private function render_card($title, $health_result, $extra_info = '') {
        $is_online = $health_result['success'];
        $class = $is_online ? 'online' : 'offline';
        ?>
        <div class="ai-card <?php echo $class; ?>">
            <h3><?php echo esc_html($title); ?></h3>
            <?php if ($is_online): ?>
                <p><span class="dashicons dashicons-yes" style="color: #46b450;"></span> <strong>Online</strong></p>
                <?php if ($extra_info): ?><p class="description"><?php echo esc_html($extra_info); ?></p><?php endif; ?>
            <?php else: ?>
                <p><span class="dashicons dashicons-no" style="color: #dc3232;"></span> <strong>Offline</strong></p>
                <p class="description"><?php echo esc_html($health_result['error']); ?></p>
            <?php endif; ?>
        </div>
        <?php
    }

    private function render_tab_sessions() {
        $sessions = $this->fetch_sessions();
        
        echo '<table class="wp-list-table widefat fixed striped">';
        echo '<thead><tr>
                <th>Session ID</th>
                <th>User ID</th>
                <th>Step</th>
                <th>Tokens</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr></thead>';
        echo '<tbody>';

        if (empty($sessions)) {
            echo '<tr><td colspan="6">No active sessions found (or unable to connect).</td></tr>';
        } else {
            foreach ($sessions as $s) {
                $sid = $s['session_id'] ?? 'unknown';
                $uid = $s['user_id'] ?? 'unknown';
                $step = $s['current_step'] ?? '-';
                $tokens = $s['token_used'] ?? 0;
                $active = $s['last_active'] ?? '';
                
                $delete_url = admin_url('admin-post.php?action=ai_delete_session&id=' . $sid);
                $view_url = $this->agent_url . '/api/v1/sessions/' . $sid;

                echo '<tr>';
                echo '<td><code>' . esc_html(substr($sid, 0, 8)) . '...</code></td>';
                echo '<td>' . esc_html($uid) . '</td>';
                echo '<td><span class="tag">' . esc_html($step) . '</span></td>';
                echo '<td>' . number_format($tokens) . '</td>';
                echo '<td>' . esc_html($active) . '</td>';
                echo '<td>
                        <a href="' . esc_url($view_url) . '" target="_blank" class="button button-small">Raw JSON</a>
                        <a href="' . wp_nonce_url($delete_url, 'delete_session_' . $sid) . '" class="button button-small button-link-delete" onclick="return confirm(\'Are you sure?\')">Delete</a>
                      </td>';
                echo '</tr>';
            }
        }
        echo '</tbody></table>';
    }

    private function render_tab_diagnostics() {
        echo '<h3>Connectivity Check</h3>';
        echo '<p>Running tests from WordPress server...</p>';

        $tests = [
            '[HTTP] Agent Health' => $this->agent_url . '/health',
            '[HTTP] Gateway Health' => $this->gateway_url . '/health',
            '[HTTP] Core MCP Health' => $this->core_mcp_url . '/health',
            '[HTTP] Checkout MCP Health' => $this->checkout_mcp_url . '/health',
            '[HTTP] Web App Root' => $this->web_app_url . '/',
        ];

        echo '<div style="background: #000; color: #0f0; padding: 15px; border-radius: 5px; font-family: monospace; overflow-x: auto;">';
        
        // HTTP Tests
        foreach ($tests as $name => $url) {
            echo "--- Testing: $name ---\n";
            echo "URL: $url\n";
            
            $start = microtime(true);
            $response = wp_remote_get($url, ['timeout' => 5, 'sslverify' => false]);
            $duration = round((microtime(true) - $start) * 1000, 2);

            if (is_wp_error($response)) {
                echo "RESULT: FAILED\n";
                echo "ERROR: " . $response->get_error_message() . "\n";
            } else {
                $code = wp_remote_retrieve_response_code($response);
                echo "RESULT: HTTP $code ($duration ms)\n";
            }
            echo "\n";
        }

        // TCP Tests
        $tcp_tests = [
            '[TCP] PostgreSQL' => [$this->postgres_host, $this->postgres_port],
            '[TCP] Redis' => [$this->redis_host, $this->redis_port],
        ];

        foreach ($tcp_tests as $name => $params) {
            echo "--- Testing: $name ---\n";
            echo "Target: {$params[0]}:{$params[1]}\n";
            $start = microtime(true);
            $fp = @fsockopen($params[0], $params[1], $errno, $errstr, 2);
            $duration = round((microtime(true) - $start) * 1000, 2);
            if ($fp) {
                echo "RESULT: CONNECTED ($duration ms)\n";
                fclose($fp);
            } else {
                echo "RESULT: FAILED\n";
                echo "ERROR: $errno - $errstr\n";
            }
            echo "\n";
        }

        echo '</div>';
    }

    private function render_tab_settings() {
        ?>
        <form method="post" action="options.php">
            <?php settings_fields('ai_agent_settings'); ?>
            <?php do_settings_sections('ai_agent_settings'); ?>
            
            <h3>HTTP Services</h3>
            <table class="form-table">
                <tr valign="top">
                    <th scope="row">Agent API URL</th>
                    <td><input type="text" name="ai_agent_url" value="<?php echo esc_attr($this->agent_url); ?>" class="regular-text" /></td>
                </tr>
                <tr valign="top">
                    <th scope="row">Tool Gateway URL</th>
                    <td><input type="text" name="ai_gateway_url" value="<?php echo esc_attr($this->gateway_url); ?>" class="regular-text" /></td>
                </tr>
                <tr valign="top">
                    <th scope="row">Core MCP URL</th>
                    <td><input type="text" name="ai_core_mcp_url" value="<?php echo esc_attr($this->core_mcp_url); ?>" class="regular-text" /></td>
                </tr>
                <tr valign="top">
                    <th scope="row">Checkout MCP URL</th>
                    <td><input type="text" name="ai_checkout_mcp_url" value="<?php echo esc_attr($this->checkout_mcp_url); ?>" class="regular-text" /></td>
                </tr>
                <tr valign="top">
                    <th scope="row">Web App URL</th>
                    <td><input type="text" name="ai_web_app_url" value="<?php echo esc_attr($this->web_app_url); ?>" class="regular-text" /></td>
                </tr>
            </table>

            <h3>PostgreSQL Configuration</h3>
            <p class="description">Requires <code>php-pgsql</code> driver installed on the server.</p>
            <table class="form-table">
                <tr valign="top">
                    <th scope="row">Host</th>
                    <td>
                        <input type="text" name="ai_postgres_host" value="<?php echo esc_attr($this->postgres_host); ?>" />
                        Port: <input type="number" name="ai_postgres_port" value="<?php echo esc_attr($this->postgres_port); ?>" class="small-text" />
                    </td>
                </tr>
                <tr valign="top">
                    <th scope="row">Database Name</th>
                    <td><input type="text" name="ai_postgres_db" value="<?php echo esc_attr($this->postgres_db); ?>" /></td>
                </tr>
                <tr valign="top">
                    <th scope="row">User</th>
                    <td><input type="text" name="ai_postgres_user" value="<?php echo esc_attr($this->postgres_user); ?>" /></td>
                </tr>
                <tr valign="top">
                    <th scope="row">Password</th>
                    <td><input type="password" name="ai_postgres_password" value="<?php echo esc_attr($this->postgres_password); ?>" /></td>
                </tr>
            </table>

            <h3>Redis Configuration</h3>
            <table class="form-table">
                <tr valign="top">
                    <th scope="row">Host</th>
                    <td>
                        <input type="text" name="ai_redis_host" value="<?php echo esc_attr($this->redis_host); ?>" />
                        Port: <input type="number" name="ai_redis_port" value="<?php echo esc_attr($this->redis_port); ?>" class="small-text" />
                    </td>
                </tr>
            </table>

            <?php submit_button(); ?>
        </form>
        <?php
    }

    // --- ACTIONS ---

    public function handle_delete_session() {
        if (!current_user_can('manage_options')) wp_die('Unauthorized');
        
        $id = $_GET['id'];
        check_admin_referer('delete_session_' . $id);

        $response = wp_remote_request($this->agent_url . '/api/v1/sessions/' . $id, [
            'method' => 'DELETE',
            'timeout' => 5
        ]);

        if (is_wp_error($response)) {
            wp_die('Error deleting session: ' . $response->get_error_message());
        }

        wp_redirect(admin_url('admin.php?page=ai-agent-control&tab=sessions&msg=deleted'));
        exit;
    }

    // --- HELPERS ---

    private function check_health($url) {
        $response = wp_remote_get($url, ['timeout' => 2, 'sslverify' => false]);
        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }
        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            return ['success' => false, 'error' => "HTTP $code"];
        }
        $data = json_decode(wp_remote_retrieve_body($response), true);
        return ['success' => true, 'data' => $data];
    }
    
    private function check_http_status($url) {
        $response = wp_remote_head($url, ['timeout' => 2, 'sslverify' => false]);
        if (is_wp_error($response)) {
             $response = wp_remote_get($url, ['timeout' => 2, 'sslverify' => false]);
        }
        
        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }
        $code = wp_remote_retrieve_response_code($response);
        if ($code >= 200 && $code < 400) {
            return ['success' => true, 'data' => ['service' => 'Web App (HTTP ' . $code . ')']];
        }
        return ['success' => false, 'error' => "HTTP $code"];
    }

    private function check_tcp($host, $port) {
        $fp = @fsockopen($host, $port, $errno, $errstr, 2); 
        if ($fp) {
            fclose($fp);
            return true;
        }
        return false;
    }

    private function fetch_sessions() {
        $response = wp_remote_get($this->agent_url . '/api/v1/sessions', ['timeout' => 5, 'sslverify' => false]);
        if (is_wp_error($response)) return [];
        $data = json_decode(wp_remote_retrieve_body($response), true);
        return is_array($data) ? $data : [];
    }
}

new AIShoppingAdmin();

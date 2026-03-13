<?php

require_once("guiconfig.inc");
require_once("/usr/local/pkg/systemup_monitor.inc");

$pkg = systemup_monitor_read_config();
$page_title = array("Status", "SystemUp Monitor");
$commands = systemup_monitor_local_commands();
$secret_masked = systemup_monitor_mask_secret($pkg['node_secret']);
$runtime = systemup_monitor_runtime_summary();
$selected_services = systemup_monitor_selected_service_labels($pkg);

include("head.inc");
?>

<body>
<?php include("fbegin.inc"); ?>
<section class="panel panel-default">
  <div class="panel-heading">
    <h2 class="panel-title">SystemUp Monitor local diagnostics</h2>
  </div>
  <div class="panel-body">
    <table class="table table-striped table-condensed">
      <tbody>
        <tr>
          <th>Enabled</th>
          <td><?=htmlspecialchars($pkg['enabled'] == 'on' ? 'yes' : 'no')?></td>
        </tr>
        <tr>
          <th>Controller URL</th>
          <td><?=htmlspecialchars($pkg['controller_url'])?></td>
        </tr>
        <tr>
          <th>Node UID</th>
          <td><?=htmlspecialchars($pkg['node_uid'])?></td>
        </tr>
        <tr>
          <th>Customer code</th>
          <td><?=htmlspecialchars($pkg['customer_code'])?></td>
        </tr>
        <tr>
          <th>Heartbeat interval</th>
          <td><?=htmlspecialchars($pkg['interval_seconds'])?>s</td>
        </tr>
        <tr>
          <th>Selected services</th>
          <td><?=htmlspecialchars(empty($selected_services) ? 'none' : implode(', ', $selected_services))?></td>
        </tr>
        <tr>
          <th>Node secret</th>
          <td><?=htmlspecialchars($secret_masked)?></td>
        </tr>
        <tr>
          <th>Runtime enabled</th>
          <td><?=htmlspecialchars($runtime['enabled'] ? 'yes' : 'no')?></td>
        </tr>
        <tr>
          <th>Runtime config ready</th>
          <td><?=htmlspecialchars($runtime['config_ready'] ? 'yes' : 'no')?></td>
        </tr>
        <tr>
          <th>Runtime config file</th>
          <td><?=htmlspecialchars($runtime['config_file'])?><?= $runtime['config_exists'] ? ' (present)' : ' (missing)' ?></td>
        </tr>
        <tr>
          <th>Service status</th>
          <td><?=htmlspecialchars($runtime['service_status'])?></td>
        </tr>
      </tbody>
    </table>

    <?php if (!$runtime['config_ready']): ?>
    <div class="alert alert-warning" role="alert">
      Faltam campos obrigatorios para gerar o runtime do agente:
      <?=htmlspecialchars(implode(', ', $runtime['missing_fields']))?>
    </div>
    <?php endif; ?>

    <div class="alert alert-info" role="alert">
      Este pacote agora instala o runtime local do agente, mas a homologacao final ainda depende
      do teste em um pfSense CE 2.8.1 real.
    </div>

    <h3>Runtime paths</h3>
    <pre><?php
echo htmlspecialchars("Agent: " . $runtime['agent_bin'] . "\n");
echo htmlspecialchars("Loop: " . $runtime['loop_bin'] . "\n");
echo htmlspecialchars("RC: " . $runtime['rc_script'] . "\n");
echo htmlspecialchars("Log: " . $runtime['log_file'] . "\n");
if (!empty($runtime['service_detail'])) {
    echo "\n" . htmlspecialchars($runtime['service_detail']);
}
?></pre>

    <h3>Operational commands</h3>
    <pre><?php foreach ($commands as $command) { echo htmlspecialchars($command) . "\n"; } ?></pre>
  </div>
</section>
<?php include("foot.inc"); ?>
</body>
</html>

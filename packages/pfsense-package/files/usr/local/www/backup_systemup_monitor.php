<?php
/**
 * Backup de config.xml — thin wrapper sobre fields XML + systemup_monitor_sync_backup_settings().
 * Campos persistentes definidos em systemup_monitor.xml; esta pagina oferece UX dedicada.
 */

require_once("guiconfig.inc");
require_once("/usr/local/pkg/systemup_monitor.inc");

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? 'save';

    if ($action === 'save') {
        $pkgref =& systemup_monitor_config_ref();
        $pkgref['config_backup_enabled'] = isset($_POST['config_backup_enabled']) ? 'on' : '';
        systemup_monitor_apply_backup_schedule_post($pkgref, $_POST);
        $pkgref['config_backup_on_change'] = isset($_POST['config_backup_on_change']) ? 'on' : '';
        $pkgref['config_backup_compress'] = isset($_POST['config_backup_compress']) ? 'on' : '';
        $pkgref['config_backup_accept_remote_requests'] = isset($_POST['config_backup_accept_remote_requests']) ? 'on' : '';
        systemup_monitor_sync_backup_settings();
        systemup_monitor_redirect_self(array('msg' => 'backup_saved'));
    }

    if ($action === 'backup_now') {
        $result = systemup_monitor_run_backup_now();
        if ((int) $result['exit_code'] !== 0) {
            systemup_monitor_redirect_self(array('msg' => 'backup_fail'));
        }
        systemup_monitor_redirect_self(array('msg' => 'backup_ok'));
    }
}

systemup_monitor_setup_package_tabs('backup');

$pkg = systemup_monitor_read_config();
$schedule = systemup_monitor_normalize_backup_schedule($pkg);
$scheduleModes = systemup_monitor_backup_schedule_modes();
$dowLabels = systemup_monitor_backup_schedule_dow_labels();
if (!isset($savemsg)) {
    $savemsg = '';
}
$backup_result = '';

$backup_summary = systemup_monitor_backup_summary();
$scheduleTimeParts = systemup_monitor_backup_schedule_time_parts($schedule['time']);

include("head.inc");
?>
<body>
<?php include("fbegin.inc"); ?>
<?php if (isset($tab_array) && function_exists('display_top_tabs')): ?>
<?php foreach ($tab_array as $tab): ?>
<?php display_top_tabs($tab); ?>
<?php endforeach; ?>
<?php endif; ?>

<?php if ($savemsg !== ''): ?>
<div class="alert alert-info"><?=htmlspecialchars($savemsg)?></div>
<?php endif; ?>

<section class="panel panel-default">
  <div class="panel-heading">
    <h2 class="panel-title">Backup de configuração</h2>
  </div>
  <div class="panel-body" style="padding: 1rem 1.25rem;">
    <p class="text-muted" style="margin: 0 0 1.25rem 0;">
      Envia <code>/conf/config.xml</code> ao controlador Monitor-Pfsense com autenticação HMAC.
      O arquivo é criptografado no servidor; o XML não fica em texto puro no banco.
    </p>
    <form method="post" class="form-horizontal">
      <input type="hidden" name="action" value="save" />
      <div class="form-group">
        <label class="col-sm-3 control-label">Habilitar backup automático</label>
        <div class="col-sm-9">
          <div class="checkbox">
            <label>
              <input type="checkbox" name="config_backup_enabled" <?=($pkg['config_backup_enabled'] ?? '') === 'on' ? 'checked' : ''?> />
              Enviar backup conforme agendamento e regras abaixo
            </label>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label">Agendamento</label>
        <div class="col-sm-9">
          <select class="form-control" id="config_backup_schedule_mode" name="config_backup_schedule_mode" style="max-width: 16em;">
            <?php foreach ($scheduleModes as $mode => $label): ?>
            <option value="<?=htmlspecialchars($mode)?>" <?=$schedule['mode'] === $mode ? 'selected' : ''?>><?=htmlspecialchars($label)?></option>
            <?php endforeach; ?>
          </select>
        </div>
      </div>
      <div class="form-group backup-schedule-field backup-schedule-hours">
        <label class="col-sm-3 control-label">Intervalo (horas)</label>
        <div class="col-sm-9">
          <input type="number" min="1" max="168" class="form-control" name="config_backup_interval_hours"
            value="<?=htmlspecialchars($schedule['interval_hours'])?>" style="max-width: 8em;" />
        </div>
      </div>
      <div class="form-group backup-schedule-field backup-schedule-time">
        <label class="col-sm-3 control-label">Horário</label>
        <div class="col-sm-9">
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;">
            <select class="form-control" name="config_backup_schedule_hour" style="width: auto; min-width: 5em;">
              <?php for ($hour = 0; $hour <= 23; $hour++): ?>
              <?php $hourValue = sprintf('%02d', $hour); ?>
              <option value="<?=$hourValue?>" <?=$scheduleTimeParts['hour'] === $hourValue ? 'selected' : ''?>><?=$hourValue?></option>
              <?php endfor; ?>
            </select>
            <span style="font-weight: 600;">:</span>
            <select class="form-control" name="config_backup_schedule_minute" style="width: auto; min-width: 5em;">
              <?php for ($minute = 0; $minute <= 59; $minute++): ?>
              <?php $minuteValue = sprintf('%02d', $minute); ?>
              <option value="<?=$minuteValue?>" <?=$scheduleTimeParts['minute'] === $minuteValue ? 'selected' : ''?>><?=$minuteValue?></option>
              <?php endfor; ?>
            </select>
          </div>
          <p class="help-block" style="margin-top: 0.35rem;">Horário local do pfSense.</p>
        </div>
      </div>
      <div class="form-group backup-schedule-field backup-schedule-weekly">
        <label class="col-sm-3 control-label">Dia da semana</label>
        <div class="col-sm-9">
          <select class="form-control" name="config_backup_schedule_dow" style="max-width: 16em;">
            <?php foreach ($dowLabels as $dow => $label): ?>
            <option value="<?=htmlspecialchars($dow)?>" <?=$schedule['dow'] === $dow ? 'selected' : ''?>><?=htmlspecialchars($label)?></option>
            <?php endforeach; ?>
          </select>
        </div>
      </div>
      <div class="form-group backup-schedule-field backup-schedule-monthly">
        <label class="col-sm-3 control-label">Dia do mês</label>
        <div class="col-sm-9">
          <select class="form-control" name="config_backup_schedule_dom" style="max-width: 8em;">
            <?php for ($day = 1; $day <= 28; $day++): ?>
            <option value="<?=$day?>" <?=$schedule['dom'] === (string) $day ? 'selected' : ''?>><?=$day?></option>
            <?php endfor; ?>
          </select>
          <p class="help-block" style="margin-top: 0.35rem;">Limite em 28 para evitar meses curtos.</p>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label">Somente se mudou</label>
        <div class="col-sm-9">
          <div class="checkbox">
            <label>
              <input type="checkbox" name="config_backup_on_change" <?=systemup_monitor_normalize_yes_no($pkg['config_backup_on_change'] ?? 'on', 'on') === 'on' ? 'checked' : ''?> />
              Entre execuções agendadas, pular upload se o hash do XML não mudou
            </label>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label">Compactar (gzip)</label>
        <div class="col-sm-9">
          <div class="checkbox">
            <label>
              <input type="checkbox" name="config_backup_compress" <?=systemup_monitor_normalize_yes_no($pkg['config_backup_compress'] ?? 'on', 'on') === 'on' ? 'checked' : ''?> />
              Enviar payload compactado
            </label>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="col-sm-3 control-label">Aceitar solicitação remota</label>
        <div class="col-sm-9">
          <div class="checkbox">
            <label>
              <input type="checkbox" name="config_backup_accept_remote_requests" <?=systemup_monitor_normalize_yes_no($pkg['config_backup_accept_remote_requests'] ?? 'on', 'on') === 'on' ? 'checked' : ''?> />
              Executar <code>config_backup_now</code> recebido no heartbeat
            </label>
          </div>
        </div>
      </div>
      <div class="form-group">
        <div class="col-sm-offset-3 col-sm-9">
          <button type="submit" class="btn btn-primary">
            <i class="fa fa-save"></i> Salvar configurações
          </button>
        </div>
      </div>
    </form>
  </div>
</section>

<section class="panel panel-default">
  <div class="panel-heading">
    <h2 class="panel-title">Status local</h2>
  </div>
  <div class="panel-body" style="padding: 1rem 1.25rem;">
    <table class="table table-striped table-condensed">
      <tbody>
        <tr>
          <th>Agendamento</th>
          <td><?=htmlspecialchars(systemup_monitor_backup_schedule_label($pkg))?></td>
        </tr>
        <tr>
          <th>Último envio</th>
          <td><?=htmlspecialchars($backup_summary['last_at'] !== '' ? $backup_summary['last_at'] : 'nunca')?></td>
        </tr>
        <tr>
          <th>Último SHA256</th>
          <td><code><?=htmlspecialchars($backup_summary['last_sha256'] !== '' ? $backup_summary['last_sha256'] : '—')?></code></td>
        </tr>
        <tr>
          <th>Último erro</th>
          <td><?=htmlspecialchars($backup_summary['last_error'] !== '' ? $backup_summary['last_error'] : '—')?></td>
        </tr>
        <tr>
          <th>Estado em</th>
          <td><code><?=htmlspecialchars($backup_summary['state_dir'])?></code></td>
        </tr>
      </tbody>
    </table>
    <form method="post" style="margin-top: 1rem;">
      <input type="hidden" name="action" value="backup_now" />
      <button type="submit" class="btn btn-success" onclick="return confirm('Enviar backup de configuração agora?');">
        <i class="fa fa-upload"></i> Enviar backup agora
      </button>
    </form>
    <?php if ($backup_result !== ''): ?>
    <pre class="text-muted" style="margin-top: 1rem; white-space: pre-wrap;"><?=htmlspecialchars($backup_result)?></pre>
    <?php endif; ?>
  </div>
</section>

<script>
(function () {
  function toggleBackupScheduleFields() {
    var mode = document.getElementById('config_backup_schedule_mode').value;
    var showHours = mode === 'hours';
    var showTime = mode === 'daily' || mode === 'weekly' || mode === 'monthly';
    var showWeekly = mode === 'weekly';
    var showMonthly = mode === 'monthly';

    document.querySelectorAll('.backup-schedule-hours').forEach(function (el) {
      el.style.display = showHours ? '' : 'none';
    });
    document.querySelectorAll('.backup-schedule-time').forEach(function (el) {
      el.style.display = showTime ? '' : 'none';
    });
    document.querySelectorAll('.backup-schedule-weekly').forEach(function (el) {
      el.style.display = showWeekly ? '' : 'none';
    });
    document.querySelectorAll('.backup-schedule-monthly').forEach(function (el) {
      el.style.display = showMonthly ? '' : 'none';
    });
  }

  var modeSelect = document.getElementById('config_backup_schedule_mode');
  if (modeSelect) {
    modeSelect.addEventListener('change', toggleBackupScheduleFields);
    toggleBackupScheduleFields();
  }
})();
</script>

<?php include("foot.inc"); ?>
</body>
</html>

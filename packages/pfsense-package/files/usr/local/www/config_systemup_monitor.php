<?php

require_once("guiconfig.inc");
require_once("/usr/local/pkg/systemup_monitor.inc");

systemup_monitor_setup_package_tabs('config');

$pkg = systemup_monitor_read_config();
$description = isset($pkg['description']) && (string)$pkg['description'] !== ''
    ? $pkg['description']
    : 'Agente Principal';

include("head.inc");
?>
<body>
<?php include("fbegin.inc"); ?>
<?php if (isset($tab_array) && function_exists('display_top_tabs')): ?>
<?php foreach ($tab_array as $tab): ?>
<?php display_top_tabs($tab); ?>
<?php endforeach; ?>
<?php endif; ?>

<section class="panel panel-default">
  <div class="panel-heading">
    <h2 class="panel-title">Configuração</h2>
  </div>
  <div class="panel-body">
    <table class="table table-striped table-hover">
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-nowrap" style="width: 10em;">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><?=htmlspecialchars($description)?></td>
          <td class="text-nowrap">
            <a href="pkg_edit.php?xml=systemup_monitor.xml&amp;id=0" title="Editar" style="color: #337ab7; text-decoration: none; padding-right: 6px;">
              <i class="fa fa-pencil"></i>
            </a>
            <a href="pkg.php?xml=systemup_monitor.xml&amp;act=del&amp;id=0" title="Excluir" style="color: #337ab7; text-decoration: none;" onclick="return confirm('Excluir esta configuração?');">
              <i class="fa fa-trash"></i>
            </a>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="form-group">
      <a href="pkg_edit.php?xml=systemup_monitor.xml&amp;id=0" class="btn btn-success btn-sm">
        <i class="fa fa-plus"></i>
        Add
      </a>
      <a href="pkg.php?xml=systemup_monitor.xml&amp;act=del&amp;id=0" class="btn btn-danger btn-sm" onclick="return confirm('Excluir esta configuração?');">
        <i class="fa fa-trash"></i>
        Delete
      </a>
    </div>
  </div>
</section>
<?php include("foot.inc"); ?>
</body>
</html>

# $FreeBSD$

PORTNAME=	pfSense-pkg-systemup-monitor
PORTVERSION=	0.2.7
PORTREVISION=	0
CATEGORIES=	sysutils
MASTER_SITES=	# empty
DISTFILES=	# empty
EXTRACT_ONLY=	# empty

MAINTAINER=	contato@systemup.inf.br
COMMENT=	pfSense package for SystemUp Monitor agent configuration and diagnostics

LICENSE=	APACHE20

NO_BUILD=	yes
NO_MTREE=	yes

SUB_FILES=	pkg-install pkg-deinstall
SUB_LIST=	PORTNAME=${PORTNAME}

do-extract:
	${MKDIR} ${WRKSRC}

do-install:
	${MKDIR} ${STAGEDIR}${PREFIX}/etc/rc.d
	${MKDIR} ${STAGEDIR}${PREFIX}/libexec/monitor-pfsense-agent
	${MKDIR} ${STAGEDIR}${PREFIX}/pkg
	${MKDIR} ${STAGEDIR}${PREFIX}/share/pfSense-pkg-systemup-monitor
	${MKDIR} ${STAGEDIR}${PREFIX}/www
	${INSTALL_SCRIPT} ${FILESDIR}${PREFIX}/etc/rc.d/monitor_pfsense_agent \
		${STAGEDIR}${PREFIX}/etc/rc.d
	${INSTALL_SCRIPT} ${FILESDIR}${PREFIX}/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh \
		${STAGEDIR}${PREFIX}/libexec/monitor-pfsense-agent
	${INSTALL_SCRIPT} ${FILESDIR}${PREFIX}/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh \
		${STAGEDIR}${PREFIX}/libexec/monitor-pfsense-agent
	${INSTALL_DATA} ${FILESDIR}${PREFIX}/pkg/systemup_monitor.inc \
		${STAGEDIR}${PREFIX}/pkg
	${INSTALL_DATA} ${FILESDIR}${PREFIX}/pkg/systemup_monitor.xml \
		${STAGEDIR}${PREFIX}/pkg
	${INSTALL_DATA} ${FILESDIR}${PREFIX}/share/pfSense-pkg-systemup-monitor/info.xml \
		${STAGEDIR}${PREFIX}/share/pfSense-pkg-systemup-monitor
	${INSTALL_SCRIPT} ${FILESDIR}${PREFIX}/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php \
		${STAGEDIR}${PREFIX}/share/pfSense-pkg-systemup-monitor
	${INSTALL_DATA} ${FILESDIR}${PREFIX}/www/config_systemup_monitor.php \
		${STAGEDIR}${PREFIX}/www
	${INSTALL_DATA} ${FILESDIR}${PREFIX}/www/status_systemup_monitor.php \
		${STAGEDIR}${PREFIX}/www
	@${REINPLACE_CMD} -i '' -e "s|%%PKGVERSION%%|${PKGVERSION}|" \
		${STAGEDIR}${PREFIX}/pkg/systemup_monitor.xml \
		${STAGEDIR}${PREFIX}/share/pfSense-pkg-systemup-monitor/info.xml

.include <bsd.port.mk>

from django.db.models.signals import post_save
from django.dispatch import receiver

from metering.mobile_supabase import push_incident, push_incident_comment

from .models import Incident, IncidentComment


@receiver(post_save, sender=Incident)
def sync_incident_to_mobile(sender, instance, raw=False, **kwargs):
    if raw:
        return
    push_incident(instance)


@receiver(post_save, sender=IncidentComment)
def sync_incident_comment_to_mobile(sender, instance, raw=False, **kwargs):
    if raw:
        return
    push_incident_comment(instance)

"""Create workflow, inspection and voice persistence."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("workflows", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("content", sa.JSON(), nullable=False),
                    sa.Column("revision", sa.Integer(), nullable=False),
                    sa.Column("version", sa.Integer(), nullable=False),
                    sa.Column("status", sa.String(), nullable=False),
                    sa.Column("updated_at", sa.String(), nullable=False),
                    sa.Column("archived", sa.Boolean(), nullable=False))
    op.create_table("workflow_versions", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("workflow_id", sa.String(), sa.ForeignKey("workflows.id"), nullable=False),
                    sa.Column("number", sa.Integer(), nullable=False),
                    sa.Column("content", sa.JSON(), nullable=False), sa.UniqueConstraint("workflow_id", "number"))
    op.create_table("sessions", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("version_id", sa.String(), sa.ForeignKey("workflow_versions.id"), nullable=False),
                    sa.Column("revision", sa.Integer(), nullable=False),
                    sa.Column("state", sa.JSON(), nullable=False))
    op.create_table("response_revisions", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id"), nullable=False),
                    sa.Column("field_id", sa.String(), nullable=False), sa.Column("response", sa.JSON(), nullable=False))
    op.create_table("session_events", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id"), nullable=False),
                    sa.Column("request_id", sa.String(), nullable=False),
                    sa.Column("fingerprint", sa.String(), nullable=False), sa.Column("at", sa.String(), nullable=False),
                    sa.Column("action", sa.JSON(), nullable=False), sa.Column("result", sa.JSON(), nullable=False),
                    sa.UniqueConstraint("session_id", "request_id"))
    op.create_table("voice_runs", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id"), nullable=False),
                    sa.Column("provider_run_id", sa.String(), nullable=True),
                    sa.Column("active", sa.Boolean(), nullable=False), sa.Column("created_at", sa.String(), nullable=False),
                    sa.Column("expires_at", sa.String(), nullable=False), sa.Column("proposal", sa.JSON(), nullable=True))
    for table, column in [("workflow_versions", "workflow_id"), ("sessions", "version_id"),
                          ("response_revisions", "session_id"), ("session_events", "session_id"),
                          ("voice_runs", "session_id")]:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table in ["voice_runs", "session_events", "response_revisions", "sessions", "workflow_versions", "workflows"]:
        op.drop_table(table)

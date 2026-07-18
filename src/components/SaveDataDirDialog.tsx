import { useEffect } from 'react';
import { checkSaveDataWritable } from '../api';

interface SaveDataDirDialogProps {
  open: boolean;
  onClose: () => void;
  onRequestSelectDir: () => void;
}

export default function SaveDataDirDialog({
  open,
  onClose: _onClose,
  onRequestSelectDir,
}: SaveDataDirDialogProps) {
  useEffect(() => {
    if (open) {
      checkWritable();
    }
  }, [open]);

  const checkWritable = async () => {
    try {
      await checkSaveDataWritable();
    } catch {
      // Directory not writable, dialog stays open
    }
  };

  const handleSelectDir = async () => {
    onRequestSelectDir();
  };

  const handleClose = () => {
    window.close();
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content save-data-dialog">
        <div className="modal-header">
          <h2>数据目录不可写</h2>
        </div>

        <div className="modal-body">
          <p>
            无法在当前目录创建数据文件。这可能是因为权限问题。
          </p>
          <p>
            请选择一个可写的目录来存储应用数据。
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={handleSelectDir}>
            选择目录
          </button>
          <button className="btn-secondary" onClick={handleClose}>
            退出
          </button>
        </div>
      </div>
    </div>
  );
}
